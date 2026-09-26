// MCP server over Streamable HTTP for TrueForge to connect to.
//
// Three tools, split so that the shielded one is the one that writes:
//
//   get_claim              read-only. No approval.
//   prepare_resubmission   mints a server-side operation_id and records a
//                          hash of the exact payload. CANNOT commit, so it
//                          needs no approval.
//   submit_claim           WRITE. The only shielded tool. TrueForge pauses
//                          the turn here and shows the reviewer the exact
//                          arguments. On release, the payer re-hashes the
//                          payload and refuses anything that no longer
//                          matches what was prepared.
//
// Why the hash check lives here and not in the harness: TrueForge 0.2.0's
// approval decision is only allow/deny against a pending call. The reviewer
// sees the arguments, but the decision does not carry them. With a
// deterministic client that gap is harmless - the arguments cannot change
// between approval and execution. With an agent, which re-derives its
// arguments on retry, it is the entire problem. So the payer records what
// was approved and verifies it at commit time.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Ledger } from './ledger.mjs';
import { getClaim } from './fixtures.mjs';

const PORT = process.env.PORT || 9123;

// Bearer token for the ledger control endpoints. Unset - which is the case on
// a laptop - leaves them exactly as they were: open, no header required. It is
// set on the deployed instance, where /approve /deny /commit would otherwise
// accept a write from anything that can reach the URL.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function authorized(req) {
  if (!ADMIN_TOKEN) return true;
  return req.headers.authorization === `Bearer ${ADMIN_TOKEN}`;
}

// Resolve relative to THIS file, not the process cwd. Launching the server
// from a different directory must not silently create a second empty
// database - during a demo that looks like "the ledger lost my row."
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.LEDGER_DB || resolve(__dirname, '../ledger.sqlite');

const ledger = new Ledger(DB_PATH);

function buildMcpServer() {
  const mcp = new McpServer({ name: 'two-key-claims', version: '0.1.0' });

  mcp.registerTool('get_claim',
    {
      title: 'Get claim',
      description: 'Read a denied claim by id. Read-only, no approval needed.',
      inputSchema: { claim_id: z.string() },
    },
    async ({ claim_id }) => ({
      content: [{ type: 'text', text: JSON.stringify(getClaim(claim_id)) }],
    })
  );

  mcp.registerTool('prepare_resubmission',
    {
      title: 'Prepare resubmission',
      description:
        'Prepare a corrected claim resubmission. This CANNOT move money. It mints a ' +
        'server-side operation_id and records a hash of the exact payload, then returns ' +
        'both so the correction can be reviewed before it is committed.',
      inputSchema: { claim_id: z.string(), amount: z.number() },
    },
    async ({ claim_id, amount }) => {
      const { operation_id, payload_hash } = ledger.propose({ claim_id, amount });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'prepared',
            operation_id,
            payload_hash,
            claim_id,
            amount,
            message: 'Prepared. Call submit_claim with this operation_id and the unchanged payload.',
          }),
        }],
      };
    }
  );

  // THE SHIELDED TOOL. This is the only one that writes, so this is the one
  // require_approval_for_tools gates. TrueForge pauses the turn here and shows
  // the reviewer the exact operation_id and payload. When the call is released,
  // the payer re-hashes the payload and refuses anything that no longer matches
  // what was prepared - which is the part TrueForge's allow/deny cannot express.
  mcp.registerTool('submit_claim',
    {
      title: 'Submit corrected claim',
      description:
        'Commit a prepared resubmission to the payer. WRITE - the only tool that ' +
        'changes stored state. Requires ' +
        'human approval. The payer verifies the payload still matches the hash recorded ' +
        'at prepare time; a changed amount is rejected, and an identical retry returns ' +
        'the original receipt instead of writing a second row.',
      inputSchema: { operation_id: z.string(), claim_id: z.string(), amount: z.number() },
    },
    async ({ operation_id, claim_id, amount }) => {
      // The call reaching this point IS the human's release of it - TrueForge
      // would not have delivered it otherwise - so record the approval here.
      // A failure is deliberately not short-circuited: an operation that was
      // denied, already committed, or unknown falls through to submit(),
      // which returns the precise reason rather than a generic one.
      ledger.approve(operation_id);

      const result = ledger.submit(operation_id, { claim_id, amount });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !result.ok,
      };
    }
  );

  return mcp;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/mcp') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await buildMcpServer().connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  // Plain HTTP endpoints outside the MCP tool surface, used by the
  // deterministic tests so the four scenarios can be exercised without
  // driving the UI. TrueForge itself does not call these: it surfaces
  // tool.approval_required and then resumes the paused call in a new turn
  // carrying user.tool_approval. There is no approval webhook.
  //
  // Unauthenticated locally, which is fine for a demo on loopback. Deployed,
  // ADMIN_TOKEN is set and all three require a bearer token - one guard here
  // rather than three copies inside the handlers below.
  if (['/approve', '/deny', '/commit'].includes(url.pathname)) {
    if (!authorized(req)) {
      respond(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
  }

  if (url.pathname === '/approve' && req.method === 'POST') {
    const body = await readJson(req);
    const result = ledger.approve(body.operation_id);
    respond(res, result.ok ? 200 : 409, result);
    return;
  }

  if (url.pathname === '/deny' && req.method === 'POST') {
    const body = await readJson(req);
    const result = ledger.deny(body.operation_id, body.reason);
    respond(res, result.ok ? 200 : 409, result);
    return;
  }

  if (url.pathname === '/commit' && req.method === 'POST') {
    const body = await readJson(req);
    const result = ledger.submit(body.operation_id, body.payload);
    respond(res, result.ok ? 200 : 409, result);
    return;
  }

  if (url.pathname === '/health') {
    respond(res, 200, { ok: true });
    return;
  }

  res.writeHead(404).end();
});

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

function respond(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

server.listen(PORT, () => {
  console.log(`Ticket-solver MCP server on http://localhost:${PORT}/mcp`);
  console.log(`ledger control: POST /approve /deny /commit  (body: {operation_id, payload?, reason?})`);
});

process.on('SIGINT', () => { ledger.close(); process.exit(0); });
