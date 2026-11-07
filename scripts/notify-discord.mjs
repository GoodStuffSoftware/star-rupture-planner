// Posts a short message to a Discord webhook. Used by the data pipeline workflows to tell
// the owner what happened (a data commit was deployed, or a run failed).
//
//   node scripts/notify-discord.mjs "message text"        (several arguments are joined with spaces)
//
// Environment:
//   DISCORD_WEBHOOK_URL  The webhook to post to (a repo secret in Actions). Unset: log a line
//                        and exit 0, so forks and local runs never fail.
//
// A notification must never fail the job it reports on: every outcome, including a network
// error or a refused post, logs one line and exits 0. The webhook URL is a credential and is
// never printed. The post carries no mentions (allowed_mentions is empty) and no link previews.

const WEBHOOK_PREFIXES = ['https://discord.com/api/webhooks/', 'https://discordapp.com/api/webhooks/']
const MAX_CONTENT = 2000
const SUPPRESS_EMBEDS = 4

const log = (line) => console.log(`notify-discord: ${line}`)

async function main() {
  const url = (process.env.DISCORD_WEBHOOK_URL || '').trim()
  if (!url) {
    log('DISCORD_WEBHOOK_URL is not set, nothing sent')
    return
  }
  if (!WEBHOOK_PREFIXES.some((p) => url.startsWith(p))) {
    log('DISCORD_WEBHOOK_URL is not a Discord webhook URL, nothing sent')
    return
  }

  const text = process.argv.slice(2).join(' ').trim()
  if (!text) {
    log('no message given, nothing sent')
    return
  }
  const content = text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT - 3)}...` : text

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Star Rupture Planner',
      content,
      flags: SUPPRESS_EMBEDS,
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.ok) log(`sent (HTTP ${res.status})`)
  else log(`Discord refused the post (HTTP ${res.status}), not retried`)
}

try {
  await main()
} catch (err) {
  // Name only: the message of a fetch error can carry the request URL.
  log(`could not post (${err?.name ?? 'error'}: ${err?.cause?.code ?? 'network'}), ignored`)
}
process.exit(0)
