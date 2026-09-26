# Deploying the payer to AWS

One t3.small running two containers — the Node app on loopback, Caddy
terminating TLS in front of it. The ledger is a SQLite file on the instance's
EBS volume, so it survives container restarts and reboots.

Design rationale, rejected alternatives and honest boundaries are in
[`../docs/superpowers/specs/2026-09-26-aws-deployment-design.md`](../docs/superpowers/specs/2026-09-26-aws-deployment-design.md).

## Prerequisites

```bash
nix shell nixpkgs#awscli2      # not installed system-wide on this machine
aws sts get-caller-identity    # confirm credentials work
export AWS_REGION=ap-south-1   # or wherever you want it
```

## 1. Build and push the image

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE="$ECR/ticket-solver:latest"

aws ecr create-repository --repository-name ticket-solver >/dev/null 2>&1 || true
aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR"

docker build -t "$IMAGE" .
docker push "$IMAGE"
```

The image is linux/amd64 and the instance is x86_64, so no `--platform` flag
and no qemu emulation — which matters because `better-sqlite3` builds native
code.

## 2. Allocate an Elastic IP

The hostname is derived from it (`1-2-3-4.nip.io`), so it has to exist before
the instance boots.

```bash
EIP=$(aws ec2 allocate-address --query PublicIp --output text)
echo "$EIP"
```

## 3. Launch

```bash
./deploy/launch.sh "$EIP" "$IMAGE"
```

Creates the security group (80/443 only, no SSH), the instance role
(SSM + ECR read), and the instance; then attaches the Elastic IP. Re-running
reuses the group and role but will not replace a running instance.

First boot takes 2–3 minutes: install Docker, wait for the EIP, pull the
image, get a certificate.

## 4. Verify

```bash
SITE="${EIP//./-}.nip.io"

curl -s "https://$SITE/health"                                        # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://$SITE/commit" -d '{}'
```

That second one must print **401**. Run it *before* you export the token, or
it passes for the wrong reason.

Then the real check — the existing four-scenario suite against the deployed
host:

```bash
aws ssm start-session --target <instance-id>   # then: sudo cat /etc/ticket-solver/env
export ADMIN_TOKEN=<value from that file>

BASE="https://$SITE" ./tests/e2e.sh
```

And confirm local behaviour is unchanged:

```bash
unset ADMIN_TOKEN
node server/mcp-server.mjs &
./tests/e2e.sh          # identical to before this change
```

Durability, which is the reason for choosing EC2 over App Runner:

```bash
sudo systemctl restart ticket-solver    # rows survive
sudo reboot                             # rows survive
```

## 5. Point TrueForge at it

```bash
curl -s http://localhost:8790/api/v1/settings/mcp-servers \
  -H 'Content-Type: application/json' \
  -d "{\"manifest\":{\"type\":\"remote\",\"name\":\"two-key-claims\",
       \"url\":\"https://$SITE/mcp\",
       \"description\":\"Claims read + corrected-resubmission\"}}"
```

## Operating it

| | |
|---|---|
| Shell | `aws ssm start-session --target <id>` (no SSH key exists) |
| Provisioning log | `sudo tail -f /var/log/user-data.log` |
| App logs | `journalctl -u ticket-solver -f` |
| TLS logs | `journalctl -u ticket-solver-caddy -f` |
| Admin token | `sudo cat /etc/ticket-solver/env` |
| Reset the ledger | `sudo systemctl stop ticket-solver && sudo rm -f /var/lib/ticket-solver/ledger.sqlite* && sudo systemctl start ticket-solver` |
| New image | `docker push` then `sudo systemctl restart ticket-solver` after `docker pull` |

`reset-demo.sh` in the repo root is laptop-only — it uses `lsof` and `nohup`
against a local process. The table row above is its server equivalent.

## Two things to know before you demo

**`/mcp` is publicly writable.** `submit_claim` writes to the ledger, and the
MCP endpoint takes no token — TrueForge's connector manifest is not confirmed
to support custom headers, so locking it would risk breaking the demo. Anyone
who has the URL can add rows. If that matters, narrow the security group:

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 revoke-security-group-ingress --group-id <sg> --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id <sg> --protocol tcp --port 443 --cidr "$MYIP/32"
```

Leave **80 open to 0.0.0.0/0** — Let's Encrypt renewal needs it. And redo this
when the venue WiFi changes your IP.

**The ledger dies with the instance.** It is on the root volume with
`DeleteOnTermination=true`. Restarts and reboots are safe; termination is not.
Snapshot first if a demo depends on existing rows.

## Tear down

Leaving it running costs roughly $15/month.

```bash
aws ec2 terminate-instances --instance-ids <id>
aws ec2 release-address --allocation-id <alloc-id>
aws ecr delete-repository --repository-name ticket-solver --force
```
