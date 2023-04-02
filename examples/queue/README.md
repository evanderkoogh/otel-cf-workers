# Cloudflare Workers Template

This template makes it easy to build and run [Cloudflare Workers](https://developers.cloudflare.com/workers/), which can be published to the [Cloudflare Global Network](https://www.cloudflare.com/network/), or run directly from Replit using `wrangler dev` (no Cloudflare account required). In the future, `wrangler dev` will be powered by [Workerd](https://github.com/cloudflare/workerd), our Open-Source Workers runtime.

## Setup

### Initialize a Workers project

Click **Run** in your Replit workspace to set up a Workers project with customizable settings using [Wrangler](https://developers.cloudflare.com/workers/wrangler/). By default, it will initialize a Git repository, set up a TypeScript project, and create a Fetch handler.

### Silence Wrangler metrics prompts

Every time a Repl using the Workers Template is booted up, Wrangler will prompt for sending anonymous metrics to Cloudflare. To silence this prompt:

1. Add a [Replit secret](https://docs.replit.com/programming-ide/storing-sensitive-information-environment-variables) with the name `WRANGLER_SEND_METRICS`.
2. Use value `true` to send anonymous metrics to Cloudflare, or `false` to opt-out.

## Develop and run in Replit

After you have initialized your Workers project, select **Run** again to deploy your Worker in dev mode. The **Run** button in your Replit workspace will run your Worker in dev mode, making your project available on a Replit subdomain. After a period of inactivity, your Repl may go to sleep until the **Run** button is pressed or the [Repl receives HTTP traffic](https://docs.replit.com/hosting/deploying-http-servers). To prevent your Repl from sleeping, enable [Always On](https://docs.replit.com/power-ups/always-on) in your Replit workspace settings.

### Develop with persistent data

You can persist development data between sessions. To run your Worker with data persisted in the `data` folder of your Repl, run the following in the Shell tab of your Replit workspace:

```shell
npm run start-persist
```

The **Run** button can also be updated to always run your Worker in persistent mode:
1. Open `package.json`.
2. Update the `replit-run-command` key with a value of `npm run start-persist`.

## Deploy Worker to Cloudflare

To deploy your Worker to the Cloudflare network, you must add your Cloudflare API token and Cloudflare account ID to Replit secrets.

### 1. Add your Cloudflare API token to Replit secrets

To add your Cloudflare API token to Replit secrets:

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In **Account Home**, select  **My Profile** on the top right.
3. Select **API Tokens** on the left-hand navigation.
4. Select **Create Token**.
5. Go to **Edit Cloudflare Workers** under **API Token Templates** and select **Use Template**.
6. Under **Account Resources**, select *All accounts* (or a specific account).
7. Under **Zone Resources**, change *Specific zone* to *All zones*.
8. Select **Continue to summary**.
9. Select **Create Token**.
10. This gives you the API token needed. Copy it to [Replit secrets](https://docs.replit.com/programming-ide/storing-sensitive-information-environment-variables) with the name `CLOUDFLARE_API_TOKEN`.

### 2. Add your Cloudflare Account ID to Replit secrets

To add your Cloudflare account ID to Replit secrets:

1. Log in to the Cloudflare dashboard > [**Workers**](https://dash.cloudflare.com/?to=/:account/workers/overview).
2. In **Workers**, find your **Account ID** on the right side of the screen.
3. Select **Click to copy** to copy your Account ID.
4. Add this to [Replit secrets](https://docs.replit.com/programming-ide/storing-sensitive-information-environment-variables) with the name `CLOUDFLARE_ACCOUNT_ID`.

Note: You may have to close and re-open the Shell tab of your Replit workspace before these secrets are available for use.

### Publish Worker to Cloudflare

After adding credentials to Replit secrets, you can publish your Worker to the Cloudflare global network. Your  Worker will publish to a `*.workers.dev` subdomain by default. To set up a `*.workers.dev` subdomain, go to the Cloudflare dashboard > [**Workers**](https://dash.cloudflare.com/?to=/:account/workers/overview) > Your subdomain > Change. To publish your project, run:

```shell
npm run deploy
```

After you have deployed your Worker, you can set up a custom domain for your project in the Cloudflare dashboard. To set up a custom domain, go to [**Workers**](https://dash.cloudflare.com/?to=/:account/workers/overview) in the Cloudflare dashboard > select your Worker > **Triggers** > **Add Custom Domain**.

To configure the **Run** button to publish to the Cloudflare global network rather than a Replit subdomain: 
1. Open `package.json`.
2. Update the `replit-run-command` key with a value of `npm run deploy`.

## Discord

Join the Cloudflare Developers community Discord to ask questions, show off what you are building, and discuss the platform with other developers: [discord.gg/cloudflaredev](https://discord.gg/cloudflaredev).
