<p align="center">
<img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge LG ThinQ 2

[![npm](https://img.shields.io/npm/v/homebridge-lg-thinq-2/latest?label=latest)](https://www.npmjs.com/package/homebridge-lg-thinq-2)
[![npm](https://img.shields.io/npm/dt/homebridge-lg-thinq-2)](https://www.npmjs.com/package/homebridge-lg-thinq-2)

> [!IMPORTANT]
> **About this project**
>
> This plugin is based entirely on [nVuln/homebridge-lg-thinq](https://github.com/nVuln/homebridge-lg-thinq), created by [nVuln](https://github.com/nVuln) and its contributors.
> The original repository stopped receiving updates (open issues and pull requests went unanswered for months), so its code was cloned into this new repository to keep working on it: Node.js 24 support, login fixes, and pending community fixes.
>
> All credit for the original work goes to its authors. This is not an official release of the original plugin, and it is not affiliated with or endorsed by LG.
>
> **Vibe-coded with Claude:** development of this version is being done with the help of [Claude](https://claude.ai/code), Anthropic's AI assistant. Changes are built, linted, and tested before release, but please review them and report any problems you find.

## Overview

Homebridge LG ThinQ is a Homebridge platform plugin for controlling and monitoring LG ThinQ appliances.

This plugin is not an official LG API client. It works with LG ThinQ account data and supports most current ThinQ2 devices, with optional support for some legacy ThinQ1 devices.

## Requirements

* Homebridge `^1.11.2` or Homebridge `^2.0.0`
* Node.js `^22.13.0`, `^24.0.0`, or `^26.0.0`

Node.js 26 requires Homebridge `2.3.0` or later, because older Homebridge versions do not support Node.js 26.

## Installation

Install the plugin from the Homebridge UI (search for `homebridge-lg-thinq-2`), or install it manually:

```sh
npm install -g homebridge-lg-thinq-2
```

### Migrating from `homebridge-lg-thinq`

This plugin uses the same platform name (`LGThinQ`) and the same configuration format as the original plugin, so your existing config can be kept.

1. Uninstall `homebridge-lg-thinq`, keeping its configuration.
2. Install `homebridge-lg-thinq-2`.
3. Restart Homebridge.

Do not install both plugins at the same time, because they register the same platform name. Device cache data is stored in a new folder, so the first start may take a little longer while devices are discovered again.

## Configuration

The Homebridge UI plugin settings are recommended.

1. Open Homebridge UI.
2. Go to the Plugins page.
3. Open the settings for Homebridge LG ThinQ.
4. Select the country and language for your LG account.
5. Sign in with your LG account to get a refresh token.
6. Click the Homebridge UI Save button.
7. Restart Homebridge or the plugin child bridge.
8. Reopen the plugin settings to review discovered devices and device options.

If no devices are listed in the plugin config, all supported devices in the LG account are enabled. Add device entries only when you want to rename devices, configure device options, or enable only specific devices.

## Manual Configuration

Manual editing is supported, but the Homebridge UI is recommended.

```json
{
  "platform": "LGThinQ",
  "auth_mode": "token",
  "refresh_token": "refresh-token-from-lg-login",
  "country": "US",
  "language": "en-US",
  "devices": []
}
```

To enable or configure only specific devices, list them by device id:

```json
{
  "platform": "LGThinQ",
  "auth_mode": "token",
  "refresh_token": "refresh-token-from-lg-login",
  "country": "US",
  "language": "en-US",
  "devices": [
    {
      "id": "device-id",
      "name": "Laundry Room Washer"
    }
  ]
}
```

| Option | Required | Description |
| --- | --- | --- |
| `platform` | Yes | Must be `LGThinQ`. |
| `auth_mode` | Yes | Use `token` for refresh-token auth. `account` is also accepted for username/password config. |
| `refresh_token` | Yes, for token auth | Refresh token returned by the LG login flow. |
| `username` | Yes, for account auth | LG ThinQ account username. |
| `password` | Yes, for account auth | LG ThinQ account password. |
| `country` | Yes | LG account country alpha-2 code, for example `US`. |
| `language` | Yes | LG account language code, for example `en-US`. |
| `devices` | No | Empty or omitted enables all supported discovered devices. |
| `thinq1` | No | Advanced legacy option. Set to `true` manually to enable ThinQ1 devices. |

Device type is detected from LG discovery data. Device-specific settings appear in the Homebridge UI after devices have been discovered.

## Support

If you would like to report a bug or ask a question, open an [issue](https://github.com/santiagosony/homebridge-lg-thinq-2/issues/new/choose) in this repository.

Please do not report problems with this version in the original repository.

## Credits and License

This project is a continuation of [homebridge-lg-thinq](https://github.com/nVuln/homebridge-lg-thinq) by [nVuln](https://github.com/nVuln), licensed under the [Apache License 2.0](LICENSE). The full commit history of the original project is preserved in this repository. See [NOTICE](NOTICE) for attribution details.

## Contributors

Special thanks to [carlosgamezvillegas](https://github.com/carlosgamezvillegas) for implementing Oven and Microwave device support. More detail in [nVuln/homebridge-lg-thinq#87](https://github.com/nVuln/homebridge-lg-thinq/issues/87).
