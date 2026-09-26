#!/usr/bin/env bash
#
# Create the security group, instance role and EC2 instance, then attach the
# Elastic IP. Safe to re-run: it looks up each resource by name before
# creating it. It will NOT replace a running instance - terminate first.
#
#   usage: deploy/launch.sh <ELASTIC_IP> <IMAGE_URI>
#
# Prerequisites (see deploy/README.md):
#   nix shell nixpkgs#awscli2
#   the ECR repo exists and the image has been pushed
#   the Elastic IP has been allocated

set -euo pipefail
cd "$(dirname "$0")/.."

EIP="${1:-}"
IMAGE="${2:-}"
if [ -z "$EIP" ] || [ -z "$IMAGE" ]; then
  echo "usage: deploy/launch.sh <ELASTIC_IP> <IMAGE_URI>" >&2
  exit 1
fi

NAME=ticket-solver
SG_NAME="$NAME-sg"
ROLE_NAME="$NAME-ec2-role"
PROFILE_NAME="$NAME-ec2-profile"
INSTANCE_TYPE=t3.small

REGION="${AWS_REGION:-$(aws configure get region)}"
[ -n "$REGION" ] || { echo "no region: set AWS_REGION or run aws configure" >&2; exit 1; }
echo "region: $REGION"

say() { printf '\n==> %s\n' "$1"; }

# ---------------------------------------------------------------- networking
say "default VPC and subnet"
VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" \
  --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
[ "$VPC_ID" != "None" ] || { echo "no default VPC in $REGION" >&2; exit 1; }
SUBNET_ID=$(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[0].SubnetId' --output text)
echo "vpc=$VPC_ID subnet=$SUBNET_ID"

say "security group ($SG_NAME)"
SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
if [ "$SG_ID" = "None" ]; then
  SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SG_NAME" --vpc-id "$VPC_ID" \
    --description "Ticket-solver: HTTP/HTTPS only, no SSH" \
    --query GroupId --output text)
  # 80 is required for the Let's Encrypt HTTP-01 challenge, not just redirects.
  # Port 22 is deliberately absent - shell access is SSM Session Manager.
  for p in 80 443; do
    aws ec2 authorize-security-group-ingress --region "$REGION" \
      --group-id "$SG_ID" --protocol tcp --port "$p" --cidr 0.0.0.0/0 >/dev/null
  done
  echo "created $SG_ID"
else
  echo "reusing $SG_ID"
fi

# ---------------------------------------------------------------------- IAM
say "instance role ($ROLE_NAME)"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow",
        "Principal":{"Service":"ec2.amazonaws.com"},
        "Action":"sts:AssumeRole"}]}' >/dev/null
  echo "created role"
else
  echo "reusing role"
fi
for arn in \
  arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore \
  arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
do
  aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "$arn" >/dev/null
done

if ! aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile \
    --instance-profile-name "$PROFILE_NAME" --role-name "$ROLE_NAME" >/dev/null
  # IAM is eventually consistent; run-instances fails if the profile is not
  # visible yet, and the error does not say so clearly.
  echo "waiting 15s for instance profile to propagate"
  sleep 15
fi

# ----------------------------------------------------------------- user-data
say "rendering user-data"
CADDYFILE_B64=$(base64 -w0 deploy/Caddyfile)
UNIT_APP_B64=$(base64 -w0 deploy/ticket-solver.service)
UNIT_CADDY_B64=$(base64 -w0 deploy/ticket-solver-caddy.service)

USER_DATA=$(mktemp)
trap 'rm -f "$USER_DATA"' EXIT
sed -e "s|__EIP__|$EIP|g" \
    -e "s|__IMAGE__|$IMAGE|g" \
    -e "s|__REGION__|$REGION|g" \
    -e "s|__CADDYFILE_B64__|$CADDYFILE_B64|g" \
    -e "s|__UNIT_APP_B64__|$UNIT_APP_B64|g" \
    -e "s|__UNIT_CADDY_B64__|$UNIT_CADDY_B64|g" \
    deploy/user-data.sh > "$USER_DATA"
# Written as an if, not `grep && exit`: under `set -e` a non-matching grep
# returns 1 and would abort the script on the success path.
if grep -q '__[A-Z_]*__' "$USER_DATA"; then
  echo "unsubstituted placeholder remains in user-data" >&2
  exit 1
fi

# ------------------------------------------------------------------ instance
say "latest Amazon Linux 2023 AMI"
AMI_ID=$(aws ssm get-parameters --region "$REGION" \
  --names /aws/service/ami-al2023-latest/al2023-ami-kernel-6.1-x86_64 \
  --query 'Parameters[0].Value' --output text)
echo "$AMI_ID"

say "launching $INSTANCE_TYPE"
INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile "Name=$PROFILE_NAME" \
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
  --block-device-mappings \
    '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
  --user-data "file://$USER_DATA" \
  --query 'Instances[0].InstanceId' --output text)
echo "$INSTANCE_ID"

say "waiting for running state"
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

say "associating $EIP"
ALLOC_ID=$(aws ec2 describe-addresses --region "$REGION" --public-ips "$EIP" \
  --query 'Addresses[0].AllocationId' --output text)
aws ec2 associate-address --region "$REGION" \
  --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null

SITE="${EIP//./-}.nip.io"
cat <<EOF

================================================================
  instance   $INSTANCE_ID
  url        https://$SITE

  First boot installs Docker, pulls the image and gets a
  certificate. Give it 2-3 minutes, then:

    curl -s https://$SITE/health

  Watch provisioning:
    aws ssm start-session --target $INSTANCE_ID
    sudo tail -f /var/log/user-data.log

  Read the admin token:
    sudo cat /etc/ticket-solver/env

  Tear down:
    aws ec2 terminate-instances --instance-ids $INSTANCE_ID
    aws ec2 release-address --allocation-id $ALLOC_ID
================================================================
EOF
