export const MCP_SERVER_NAME = 'reBrowser'

export const MANUAL_SETUP_DOCS_URL =
  'https://github.com/BlueOriginAI/reBrowser/blob/main/skills/rebrowser/SKILL.md'

export const MANUAL_SETUP_CARD_LINE =
  'Connect it by hand: add the endpoint, then install the skill.'

export interface ManualSetupStep {
  id: string
  title: string
  body: string
  note?: string
}

export const MANUAL_SETUP_STEPS: readonly ManualSetupStep[] = [
  {
    id: 'add-mcp',
    title: 'Add the MCP server',
    body: `Point your agent at the endpoint URL from this page and add it as a streamable HTTP MCP server named ${MCP_SERVER_NAME}. Where that setting lives depends on the agent, so check its own MCP documentation.`,
    note: 'Read the URL from the top of this page rather than assuming a port. It is a loopback address and the port is not the same across builds.',
  },
  {
    id: 'install-skill',
    title: 'Install the skill',
    body: 'The MCP server gives your agent the tools. The skill tells it how to use them: to work in its own tabs instead of yours, to name its session so you can find it in the cockpit, and to reach for this browser rather than its own fetcher.',
    note: 'Copy skills/rebrowser/SKILL.md from this repository into your agent’s skills directory, following its skill installation instructions.',
  },
]
