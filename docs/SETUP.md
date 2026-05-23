# Setup — the long version

If `npm run setup` from the root just worked for you, you don't need this page. This is the manual / troubleshooting version.

## Requirements

- **Node 18.17+** (we use ESM, native `fetch`, and `--watch`). Check with `node -v`.
- **An Anthropic API key** — sign up at [console.anthropic.com](https://console.anthropic.com/settings/keys). The COS uses Claude Opus by default at ~$0.05–0.12 per chat turn.
  - *Or* an existing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installation on the same machine. The Agent SDK falls back to that session if no API key is set in env.
- **(Optional)** A personal Microsoft account (Hotmail, Outlook.com, or Office 365 personal) if you want email triage + calendar.

## Manual setup

```bash
# 1. clone
git clone https://github.com/<your-user>/family-os.git
cd family-os

# 2. install
cd app
npm install
cd ..

# 3. write app/.env
cp app/.env.example app/.env
# edit app/.env and set ANTHROPIC_API_KEY (and PRINCIPAL_NAME)

# 4. scaffold your data folder from the templates
cp -r data.example data
# (Windows PowerShell: Copy-Item -Recurse data.example data)

# 5. run
npm start
# open http://localhost:4317
```

## Configuration reference (app/.env)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Your Anthropic key. Blank = fall back to Claude Code session. |
| `MODEL` | `claude-opus-4-7` | Which model to use. Any Claude model the SDK supports. |
| `PRINCIPAL_NAME` | `the user` | What the COS calls you in prompts. |
| `MS_CLIENT_ID` | `14d82eec-204b-4c2f-b7e8-296a70dab67e` | Microsoft Graph public CLI client. Don't change unless you registered your own app. |
| `PORT` | `4317` | The local server port. |
| `BRIEF_HOUR` | `7` | Hour (24h, local) after which the morning brief is allowed to auto-generate. |

## Connecting Outlook (Microsoft Graph)

1. Start the app (`npm start`) and open `http://localhost:4317`.
2. Click **Connect Outlook** in the Today's Inbox card.
3. A modal shows a device code and a URL — e.g. `ABCD-1234` at `https://microsoft.com/devicelogin`.
4. Open that URL on any device, enter the code, sign in with the Microsoft account whose inbox/calendar you want to connect, consent to the scopes:
   - `Mail.Read` — read your inbox
   - `Calendars.ReadWrite` — read and modify your calendar
   - `User.Read` — your basic profile
   - `offline_access` — refresh tokens so we don't ask again
5. The server polls until your sign-in completes, then writes `data/connections/microsoft.json`. The card flips to connected and "Today's Inbox" starts populating.

If the device-code dialog says it's connecting *but never finishes*: the most common cause is closing the device-login tab before consenting. Just disconnect (`POST /api/disconnect/microsoft` or restart the app) and try again.

### "Sign-in failed" — why our MS_CLIENT_ID

Microsoft has been deprecating directory-less app registration for personal accounts. We work around this by using the **public first-party** "Graph Command Line Tools" client ID — `14d82eec-204b-4c2f-b7e8-296a70dab67e`. It accepts personal accounts via device-code flow and requires no Azure setup on your side.

If you'd rather register your own app in [Microsoft Entra ID](https://entra.microsoft.com), you can: create a new app, set the redirect URI for **public client / native** to `https://login.microsoftonline.com/common/oauth2/nativeclient`, enable "Allow public client flows", add the same scopes above, and put your new client ID in `app/.env` as `MS_CLIENT_ID`.

## Common gotchas

#### Node version

```text
Error: ReferenceError: fetch is not defined
```

You're on Node < 18. Upgrade. (`nvm install 20 && nvm use 20`.)

#### Port already in use

```text
Error: EADDRINUSE address already in use 0.0.0.0:4317
```

Either another instance of Family OS is running, or something else grabbed the port. Find and kill it (`lsof -i :4317` on mac/Linux; `Get-NetTCPConnection -LocalPort 4317` on Windows), or set a different `PORT` in `app/.env`.

#### "tool_use ids must be unique"

You're on an old version of `@anthropic-ai/claude-agent-sdk`. The pinned version (0.3.x+) fixes this. `cd app && npm install` to pull the latest.

#### Encoded characters got mangled

The open-loops format uses `·` (U+00B7) and `–` (U+2013). If you're testing the loops API with `curl` from bash, the shell might mangle UTF-8 on its way through the pipe. Use a Node `fetch` script for testing, not bash/curl. The server itself is UTF-8 safe.

## Running as a startup task

### Windows

A `start-familyos.vbs` script can be added to launch the server hidden on logon:

```cmd
schtasks /Create /TN FamilyOS /TR "wscript C:\path\to\family-os\start-familyos.vbs" /SC ONLOGON /F
```

(Not included in the public repo yet — easy to write; PR welcome.)

### macOS

A `launchd` plist would go in `~/Library/LaunchAgents/com.familyos.plist`. (Not included; PR welcome.)

### Linux

A systemd user unit at `~/.config/systemd/user/family-os.service`. (Not included; PR welcome.)

## Updating

```bash
git pull
cd app && npm install
```

Your `data/` and `app/.env` are not touched by updates. Your COS persona is in `family-os/skills/family-os/SKILL.md` — if you've customized it heavily, you may want to merge upstream changes manually.

## Uninstalling

Delete the folder. Revoke the Microsoft consent at [https://account.live.com/consent/Manage](https://account.live.com/consent/Manage) (find "Graph Command Line Tools" or whatever client you connected with, click Remove). Delete your Anthropic API key from `console.anthropic.com/settings/keys` if you only used it for Family OS. Done.
