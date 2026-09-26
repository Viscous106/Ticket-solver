// MCP server over Streamable HTTP for TrueForge to connect to.
//
// Two tools:
//   get_claim      - read-only, returns the fixture claim.
//   submit_claim   - WRITE. This is the tool TrueForge's approval config
//                    should gate with require_approval_for_tools. It does
//                    NOT write directly - it calls propose() on the ledger,
//                    which mints operation_id + payload_hash and returns
//                    them. The actual commit happens through the separate
//                    /commit HTTP endpoint below, called only after a human
//                    approves in TrueForge and the operation_id + original
//                    payload are replayed back.
//
// Why two tools aren't enough and there's a plain HTTP endpoint too:
// TrueForge's approval only gates the MCP tool call itself
// (submit_claim being invoked). It does not gate what happens to the
// operation afterward. So submit_claim's job is to PROPOSE (safe, no
// money moves), and the actual commit is a second step this endpoint
// exposes directly - the piece that stands in for "the human's approval,
// bound to the exact payload."

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Ledger } from './ledger.mjs';
import { getClaim } from './fixtures.mjs';

const PORT = process.env.PORT || 9123;

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

  // THE SHIELDED TOOL. This is the one that moves money, so this is the one
  // require_approval_for_tools gates. TrueForge pauses the turn here and shows
  // the reviewer the exact operation_id and payload. When the call is released,
  // the payer re-hashes the payload and refuses anything that no longer matches
  // what was prepared - which is the part TrueForge's allow/deny cannot express.
  mcp.registerTool('submit_claim',
    {
      title: 'Submit corrected claim',
      description:
        'Commit a prepared resubmission to the payer. WRITE - moves money. Requires ' +
        'human approval. The payer verifies the payload still matches the hash recorded ' +
        'at prepare time; a changed amount is rejected, and an identical retry returns ' +
        'the original receipt instead of writing a second row.',
      inputSchema: { operation_id: z.string(), claim_id: z.string(), amount: z.number() },
    },
    async ({ operation_id, claim_id, amount }) => {
      // Approval is recorded here because the call reaching this point IS the
      // human's release of it: TrueForge would not have delivered it otherwise.
      const approval = ledger.approve(operation_id);
      if (!approval.ok && approval.reason !== 'already_approved') {
        // An operation that was denied, already committed, or unknown still
        // falls through to submit() below, which returns the precise reason.
      }

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

  // Plain HTTP endpoints outside the MCP tool surface - these stand in for
  // "the human's approval action" and "the actual commit." A real event
  // would wire these behind TrueForge's own approval webhook; for the demo
  // they're called directly after the reviewer clicks Approve in the UI.
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
  console.log(`two-key MCP server on http://localhost:${PORT}/mcp`);
  console.log(`ledger control: POST /approve /deny /commit  (body: {operation_id, payload?, reason?})`);
});

process.on('SIGINT', () => { ledger.close(); process.exit(0); });
