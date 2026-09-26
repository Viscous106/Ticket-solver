# AWS deployment — Ticket-solver payer

_2026-09-26 · approach B: EC2 + Docker + Caddy + nip.io_

## Purpose

Put the mock payer (MCP Streamable HTTP + ledger control endpoints) behind a
stable public HTTPS URL on AWS, paid for with the Agents That Act hackathon
credits.

Stated honestly, because it affects the design: **the demo does not need this.**
TrueForge runs on `localhost:8790` and reaches the payer over loopback today, and
adding a network hop introduces failure modes a local demo does not have. The
reasons to deploy anyway are (a) spending the provided credits, (b) giving
teammates and judges a URL they can hit, (c) taking the laptop out of the
critical path — TrueForge OOM-killed itself five times on this machine during
the build.

Success criteria:

1. `https://<host>/health` returns `{"ok":true}` from any network.
2. `BASE=https://<host> ./tests/e2e.sh` passes all four scenarios.
3. TrueForge registers the connector against the HTTPS URL and
   `submit_claim` still pauses for approval.
4. The ledger survives a container restart and an instance reboot.
5. Running locally is unchanged — no new required env vars, no behaviour drift.

## Constraints that drove the choices

- **`better-sqlite3` is a native module** writing a WAL-mode file. This rules out
  Lambda (no persistent filesystem) and makes EFS a poor fit (SQLite over NFS has
  known locking problems). It needs a real block device.
- **The ledger is the product.** An "immutable ledger" that empties on redeploy
  is the one failure a judge would notice. Persistence is a requirement, not a
  nice-to-have. This is what rules out App Runner, whose filesystem is ephemeral
  and which cannot mount EFS.
- **No IaC tooling installed** (no Terraform/CDK/SAM), and NixOS for the AWS CLI
  (`nix shell nixpkgs#awscli2`). Step count is a real cost, so the design
  minimises distinct AWS resources.
- **Claude cannot run AWS-authenticated commands** — `~/.aws` is denied in its
  sandbox. Claude authors every file; the operator runs every AWS call.

## Architecture

```
  TrueForge (laptop, :8790)
        │  HTTPS
        ▼
  ┌──────────────────────────────────────────────┐
  │ EC2 t3.small · Amazon Linux 2023 · x86_64    │
  │                                              │
  │  Caddy (container, --network host)           │
  │    :80  ACME HTTP-01 challenge               │
  │    :443 TLS termination                      │
  │       └─ reverse_proxy 127.0.0.1:9123        │
  │                                              │
  │  app (container)                             │
  │    -p 127.0.0.1:9123:9123                    │
  │    -v /var/lib/ticket-solver:/data           │
  │    LEDGER_DB=/data/ledger.sqlite             │
  └──────────────────────────────────────────────┘
        │
   EBS gp3 root (20 GB) ── /var/lib/ticket-solver/ledger.sqlite
```

**Hostname.** `<elastic-ip>.nip.io`. nip.io resolves `1-2-3-4.nip.io` to
`1.2.3.4`, which lets Let's Encrypt issue a real certificate with no domain
purchase. AWS credits do not cover domain registration, so this avoids the one
out-of-pocket cost. `sslip.io` is the fallback if nip.io is down.

**Why x86_64 and not Graviton.** t4g is cheaper, but building an arm64 image on
an x86 laptop means qemu emulation, and `better-sqlite3` compiles native code.
t3.small removes cross-compilation risk entirely for ~$0.004/hr more.

## Components

### 1. `Dockerfile` (new)

Pins Node 22 so the host never has to provide it, and builds `better-sqlite3`
at image build time rather than on the instance.

- `FROM node:22-slim`
- install `python3 make g++` only in a build stage (prebuilt binaries are used
  when available; the toolchain is the fallback), then `npm ci --omit=dev`
- copy `server/`, `package.json`, `package-lock.json`
- `ENV PORT=9123 LEDGER_DB=/data/ledger.sqlite`
- `EXPOSE 9123`, `CMD ["node","server/mcp-server.mjs"]`

Multi-stage so the runtime image carries no compiler.

### 2. `server/mcp-server.mjs` — bearer token on the write endpoints

`/approve`, `/deny` and `/commit` are unauthenticated today. The README is
explicit that this is fine locally and not fine in production; a public URL is
the case it warns about. ~10 lines, additive:

```js
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function authorized(req) {
  if (!ADMIN_TOKEN) return true;              // unset → local behaviour unchanged
  return req.headers.authorization === `Bearer ${ADMIN_TOKEN}`;
}
```

Guard the three write paths; return 401 on failure. `/health` and `/mcp` stay
open.

**`/mcp` is deliberately left open, and that is a real exposure.** `submit_claim`
writes, so anyone who finds the URL can `prepare_resubmission` then
`submit_claim` and add rows to the demo ledger. It is left open because
TrueForge's connector manifest is not confirmed to support custom headers —
locking it down without verifying that first would break the demo. Two
mitigations, in order of preference:

1. Restrict the security group's :443 rule to the operator's public IP. Costs
   nothing, breaks nothing, and defeats opportunistic access. Requires a rule
   edit when the venue's IP changes.
2. If the TrueForge connector does support headers, extend `authorized()` to
   cover `/mcp` too.

This must be verified against the real connector, not assumed.

### 3. `tests/e2e.sh` — two changes

```diff
-BASE="http://localhost:9123"
+BASE="${BASE:-http://localhost:9123}"
```

and the control-endpoint helper on line 32 must send the token, or every
`/approve`, `/deny` and `/commit` call returns 401 against the deployed host:

```diff
-  curl -s -m 5 -X POST "$BASE/$1" -H "Content-Type: application/json" -d "$2"
+  curl -s -m 5 -X POST "$BASE/$1" -H "Content-Type: application/json" \
+       ${ADMIN_TOKEN:+-H "Authorization: Bearer $ADMIN_TOKEN"} -d "$2"
```

Both default to current behaviour when the variables are unset, so local runs
are byte-identical to today. This pairing is easy to miss: adding the token
guard without this change silently breaks the test that proves the deployment
works.

### 4. `deploy/user-data.sh` (new)

Runs at first boot:

1. `dnf install -y docker`, enable and start it.
2. Poll IMDSv2 for the public IPv4 until it equals the expected Elastic IP —
   this resolves the ordering problem where Caddy would otherwise request a
   certificate before the EIP is attached.
3. `mkdir -p /var/lib/ticket-solver /etc/ticket-solver`. Generate the admin
   token once — `openssl rand -hex 32` — and write it to
   `/etc/ticket-solver/env` as `ADMIN_TOKEN=…`, mode `0600`, root-owned. It is
   generated on the instance rather than passed through user-data because
   user-data is readable from IMDS by anything running on the box. The operator
   reads it back over SSM when they need it:
   `aws ssm start-session --target <id>` then `sudo cat /etc/ticket-solver/env`.
4. `aws ecr get-login-password | docker login`, pull the app image.
5. Write `/etc/ticket-solver/Caddyfile` with the resolved hostname.
6. Install and start two systemd units.

Fails loudly rather than half-starting: `set -euo pipefail`, and each step logs
to `/var/log/user-data.log`.

### 5. systemd units (new, in `deploy/`)

Two units running `docker run --rm`, avoiding a dependency on
`docker-compose-plugin`, which is not reliably packaged on AL2023.

- `ticket-solver.service` — the app. `-p 127.0.0.1:9123:9123` so the app port is
  not reachable from outside the host regardless of security group rules.
  `-v /var/lib/ticket-solver:/data`. `Restart=always`.
  `EnvironmentFile=/etc/ticket-solver/env`, passed through with
  `--env-file /etc/ticket-solver/env`, which is what supplies `ADMIN_TOKEN`.
- `ticket-solver-caddy.service` — `caddy:2-alpine`, `--network host`, Caddyfile
  mounted read-only, named volume for certificate storage so a restart does not
  re-request from Let's Encrypt (which rate-limits 5 duplicate certs/week).
  `Restart=always`, `After=ticket-solver.service`.

### 6. `deploy/Caddyfile`

```
{$SITE_ADDRESS} {
    reverse_proxy 127.0.0.1:9123
}
```

### 7. AWS resources

| Resource | Setting |
|---|---|
| EC2 | t3.small, AL2023 x86_64, AMI from SSM public parameter `/aws/service/ami-al2023-latest/al2023-ami-kernel-6.1-x86_64` |
| EBS | 20 GB gp3, root, `DeleteOnTermination=true` |
| Elastic IP | allocated first, associated after launch |
| Security group | inbound `80/tcp` and `443/tcp`. **No port 22.** Outbound all |
| IAM instance profile | `AmazonSSMManagedInstanceCore` (shell via Session Manager) + `AmazonEC2ContainerRegistryReadOnly` (image pull) |
| ECR | one private repository, `ticket-solver` |

No SSH key pair is created. Shell access is `aws ssm start-session`, which
leaves an audit trail and removes the need to expose 22.

## Deployment flow

Operator runs all of these; Claude writes the scripts.

```
nix shell nixpkgs#awscli2
  1. aws ecr create-repository --repository-name ticket-solver
  2. docker build -t ticket-solver . && docker push <ecr>/ticket-solver:latest
  3. aws ec2 allocate-address                    → EIP
  4. bash deploy/launch.sh <EIP> <ECR_URI>       → SG, role, instance, associate
  5. verify
```

`deploy/launch.sh` is idempotent where it cheaply can be: it looks up existing
security group and instance profile by name before creating them.

## Verification

```bash
HOST=https://<eip>.nip.io
export ADMIN_TOKEN=<read from /etc/ticket-solver/env over SSM>

curl -s $HOST/health                                                    # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST $HOST/commit -d '{}'   # 401 (no token)
BASE=$HOST ./tests/e2e.sh                                               # four scenarios pass
```

The 401 check must run **before** exporting the token, or it passes for the
wrong reason. Run the suite locally too (`./tests/e2e.sh` with both variables
unset) to confirm the changes did not alter local behaviour.

Then register the connector in TrueForge against `$HOST/mcp` and confirm
`submit_claim` still raises `tool.approval_required`.

Ledger durability, which is the point of choosing this approach:

```bash
aws ssm start-session --target <id>
sudo systemctl restart ticket-solver      # rows survive
sudo reboot                               # rows survive
```

## Cost

| Item | Rate | Hackathon weekend |
|---|---|---|
| t3.small | $0.0208/hr | ~$1.00 |
| gp3 20 GB | ~$1.60/mo | ~$0.10 |
| Elastic IP | free while attached | $0 |
| ECR | $0.10/GB-mo | ~$0.02 |

Roughly **$1–2** for the event, against $200 Free Tier credits plus $25 onsite.
An idle instance left running costs ~$15/mo, so terminate it afterwards.

## Honest boundaries

- **Single instance. No HA, no autoscaling.** Correct for a demo; it would not be
  for anything real.
- **The ledger survives restart and reboot, not termination.** It lives on the
  root EBS volume with `DeleteOnTermination=true`. An EBS snapshot before the
  demo is the cheap insurance if that matters.
- **`/mcp` is publicly writable** unless the security group is narrowed. See §2.
- **nip.io is a third-party dependency** in the TLS path at certificate issuance
  time. Once the cert is issued it is not needed again until renewal, but a
  first boot during a nip.io outage will fail to get a certificate.
- **CloudFront was considered and rejected.** It solves the same TLS problem with
  ~10 more steps and a 5–15 minute distribution rollout. Caddy plus nip.io gets
  the same result with one container.

## Rollback

Local development is unaffected: `ADMIN_TOKEN` unset preserves current
behaviour, and the `e2e.sh` default is unchanged. Tearing down AWS is
`aws ec2 terminate-instances`, `aws ec2 release-address`, and
`aws ecr delete-repository --force`. Nothing in the deployment writes back to
the repository.
