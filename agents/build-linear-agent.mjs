// Assembles the create-agent body for `ticket-solver-linear` and prints it.
// No network. Skills are inlined into instructions because the repo is
// private, so TrueForge cannot load them by git URL - the same way the
// existing `ticket-solver` agent carries `safe-resubmission`.
//
//   node agents/build-linear-agent.mjs | curl -s -X POST \
//     http://localhost:8790/api/v1/agents -H 'Content-Type: application/json' -d @-

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const body = (p) => read(p).replace(/^---\n[\s\S]*?\n---\n/, '').trim();

const instructions = [
  read('agents/ticket-solver-linear.base.md').trim(),
  body('skills/linear-claim-ticket/SKILL.md'),
  body('skills/safe-resubmission/SKILL.md'),
].join('\n\n\n');

const agent = {
  name: 'ticket-solver-linear',
  description: 'Works synthetic claim tickets from Linear: resubmits with payload-bound approval, reports back once.',
  manifest: {
    model: { name: 'openai/gpt-5-4-mini' },
    instructions,
    mcp_servers: [
      {
        name: 'linear',
        enable_tools: [
          'list_issues', 'get_issue', 'list_comments', 'list_issue_statuses',
          'save_comment', 'save_issue',
        ],
        disable_tools: [],
        preload_tools: [],
        require_approval_for_tools: ['save_comment', 'save_issue'],
        preload: true,
      },
      {
        name: 'two-key-claims',
        enable_tools: ['get_claim', 'prepare_resubmission', 'submit_claim'],
        disable_tools: [],
        preload_tools: [],
        require_approval_for_tools: ['submit_claim'],
        preload: true,
      },
    ],
    config: {
      iteration_limit: 20,
      sandbox: { enabled: true, file_downloads: true },
      dynamic_sub_agents: { enabled: false },
      context_management: {
        compaction: { enabled: false },
        large_tool_response: { enabled: true },
      },
      generative_ui: { enabled: true },
      ask_user_questions: { enabled: false },
      web_search: { enabled: false },
    },
  },
};

process.stdout.write(JSON.stringify(agent, null, 2) + '\n');
