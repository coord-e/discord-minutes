# discord-minutes

Create a minute of meeting in Discord using Voice Recoginition.

## Get started

1. Create a configuration file named `config.json` like below:

```json
{
  "token": "<Token generated for your bot>",
  "prefix": "!"
}
```

2. Export `GOOGLE_APPLICATION_CREDENTIALS` variable

```bash
export GOOGLE_APPLICATION_CREDENTIALS='<path to your credential json>'
```

3. Start the bot

```bash
node index.js
```
