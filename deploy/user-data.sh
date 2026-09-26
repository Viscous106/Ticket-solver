#!/usr/bin/env bash
#
# EC2 first-boot provisioning. Rendered by deploy/launch.sh, which substitutes
# the __PLACEHOLDER__ values and base64-embeds the unit files so this script is
# self-contained by the time it reaches the instance.
#
# Everything is logged to /var/log/user-data.log. Read it with:
#   aws ssm start-session --target <instance-id>
#   sudo tail -f /var/log/user-data.log

set -euo pipefail
exec > >(tee -a /var/log/user-data.log) 2>&1
echo "=== user-data start $(date -Is) ==="

EXPECTED_EIP="__EIP__"
IMAGE="__IMAGE__"
REGION="__REGION__"

dnf install -y docker
systemctl enable --now docker

# Wait for the Elastic IP before Caddy asks Let's Encrypt for anything. The
# instance boots with an ephemeral public IP and launch.sh associates the EIP
# a moment later; requesting a certificate in that window would get one for
# the wrong name and burn a rate-limit slot. The IMDSv2 token is refetched
# each iteration because it expires well before the timeout does.
IP=""
for _ in $(seq 1 60); do
  TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token \
            -H 'X-aws-ec2-metadata-token-ttl-seconds: 120' || true)
  IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
        http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  [ "$IP" = "$EXPECTED_EIP" ] && break
  echo "waiting for EIP $EXPECTED_EIP (currently '${IP:-none}') ..."
  sleep 5
done
if [ "$IP" != "$EXPECTED_EIP" ]; then
  echo "FATAL: elastic IP $EXPECTED_EIP never attached (saw '${IP:-none}')" >&2
  exit 1
fi

SITE_ADDRESS="${EXPECTED_EIP//./-}.nip.io"
echo "site address: $SITE_ADDRESS"

mkdir -p /var/lib/ticket-solver /etc/ticket-solver
# uid 1000 is the `node` user inside the image, which owns the bind mount.
chown -R 1000:1000 /var/lib/ticket-solver

# Generated here rather than passed in through user-data: user-data is readable
# from IMDS by anything running on the instance. Written once, so a re-run does
# not invalidate a token already handed out.
if [ ! -f /etc/ticket-solver/env ]; then
  cat > /etc/ticket-solver/env <<EOF
ADMIN_TOKEN=$(openssl rand -hex 32)
IMAGE=$IMAGE
SITE_ADDRESS=$SITE_ADDRESS
EOF
  chown root:root /etc/ticket-solver/env
  chmod 600 /etc/ticket-solver/env
fi

echo "__CADDYFILE_B64__"    | base64 -d > /etc/ticket-solver/Caddyfile
echo "__UNIT_APP_B64__"     | base64 -d > /etc/systemd/system/ticket-solver.service
echo "__UNIT_CADDY_B64__"   | base64 -d > /etc/systemd/system/ticket-solver-caddy.service

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${IMAGE%%/*}"
docker pull "$IMAGE"

systemctl daemon-reload
systemctl enable --now ticket-solver.service
systemctl enable --now ticket-solver-caddy.service

# Give Caddy a moment to complete the ACME handshake before reporting.
sleep 20
echo "--- local health ---"
curl -sf http://127.0.0.1:9123/health || echo "app not answering on loopback"
echo
echo "--- public health ---"
curl -sf "https://$SITE_ADDRESS/health" || echo "TLS not ready yet - check: journalctl -u ticket-solver-caddy"
echo
echo "=== user-data done $(date -Is) ==="
