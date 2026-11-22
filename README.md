<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-wordmark-logo-vertical.png" width="150" alt="Homebridge logo">
</p>

<h1 align="center">Homebridge LG ThinQ 2</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/homebridge-lg-thinq-2"><img src="https://img.shields.io/npm/v/homebridge-lg-thinq-2?label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/homebridge-lg-thinq-2"><img src="https://img.shields.io/npm/dt/homebridge-lg-thinq-2" alt="npm downloads"></a>
  <a href="https://github.com/santiagosony/homebridge-lg-thinq-2/actions/workflows/build.yml"><img src="https://github.com/santiagosony/homebridge-lg-thinq-2/actions/workflows/build.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/node/v/homebridge-lg-thinq-2" alt="Node.js version">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/santiagosony/homebridge-lg-thinq-2" alt="License: Apache-2.0"></a>
</p>

<p align="center">
  A <a href="https://homebridge.io">Homebridge</a> plugin to control and monitor LG ThinQ appliances from Apple Home.
</p>

> [!IMPORTANT]
> **About this project**
>
> This plugin is based entirely on [nVuln/homebridge-lg-thinq](https://github.com/nVuln/homebridge-lg-thinq), created by [nVuln](https://github.com/nVuln) and its contributors. The original repository stopped receiving updates (issues and pull requests went unanswered for months), so its code, including its full commit history, was moved to this repository to keep it working: Node.js 24 and 26 support, login fixes, and pending community fixes.
>
> All credit for the original work goes to its authors. This is not an official release of the original plugin, and it is not affiliated with or endorsed by LG Electronics.
>
> **Vibe-coded with Claude:** this version is being developed with the help of [Claude](https://claude.ai/code), Anthropic's AI assistant. Every change is built, linted, and tested on Node.js 22, 24, and 26 before release, but please review the changes and [report any problem](https://github.com/santiagosony/homebridge-lg-thinq-2/issues/new/choose) you find.

## Contents

- [Supported devices](#supported-devices)
- [Requirements](#requirements)
- [Installation](#installation)
- [Migrating from homebridge-lg-thinq](#migrating-from-homebridge-lg-thinq)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Command-line tool](#command-line-tool)
- [Development](#development)
- [Contributing and support](#contributing-and-support)
- [Credits](#credits)
- [License](#license)

## Supported devices

The plugin works with devices linked to an LG ThinQ account. Most current devices use the **ThinQ2** platform and get instant updates. Some older devices use the legacy **ThinQ1** platform, which must be enabled manually and is only refreshed periodically.

| Device | Monitoring | Control | ThinQ2 | ThinQ1 |
| --- | --- | --- | --- | --- |
| Air Conditioner | Yes | Yes | Yes | Yes |
| Air Purifier | Yes | Yes | Yes | Yes |
| AeroTower | Yes | Yes | Yes | No |
| Refrigerator | Yes | Yes | Yes | Yes |
| Washer / Dryer / WashTower | Yes | Limited | Yes | Yes |
| Dishwasher | Yes | No | Yes | No |
| Dehumidifier | Yes | Partial | Yes | No |
| Styler | Yes | Limited | Yes | No |
| Range Hood | Yes | Yes | Yes | Yes |
| Oven | Yes | Partial | Yes | No |
| Microwave | Yes | Partial | Yes | No |

Support depends on the model data that LG returns. If a device appears in the LG ThinQ app but not in Homebridge, [request it](https://github.com/santiagosony/homebridge-lg-thinq-2/issues/new/choose) with the device type, model, country, and debug logs.

This plugin is not an official LG API client. It uses the same services as the LG ThinQ mobile app.

## Requirements

- **Homebridge** `1.11.2` or later, or Homebridge `2.x`.
- **Node.js** `22.13.0` or later in the 22 line, `24.x`, or `26.x`.
  - Node.js 26 requires Homebridge `2.3.0` or later.
- An **LG ThinQ account** with your devices already added in the LG ThinQ app.

## Installation

Search for `homebridge-lg-thinq-2` in the **Plugins** page of the Homebridge UI and install it.

To install it from the command line instead:

```sh
npm install -g homebridge-lg-thinq-2
```

Then follow the [configuration](#configuration) steps.

## Migrating from homebridge-lg-thinq

This plugin uses the same platform name (`LGThinQ`) and the same configuration format as the original plugin, so you can keep your existing configuration.

1. Uninstall `homebridge-lg-thinq`, and choose to keep its configuration.
2. Install `homebridge-lg-thinq-2`.
3. Restart Homebridge.

> [!WARNING]
> Do not install both plugins at the same time: they register the same platform name.

The device cache is stored in a new folder, so the first start can take a little longer while your devices are discovered again. HomeKit may treat the devices as new accessories, so check your rooms, scenes, and automations afterwards.

## Configuration

### Using the Homebridge UI (recommended)

1. Open the Homebridge UI and go to **Plugins**.
2. Open the settings of **Homebridge LG ThinQ 2**.
3. Select the **country** and **language** of your LG account.
4. Sign in with your LG account to get a refresh token.
5. Click **Save** in the Homebridge UI.
6. Restart Homebridge, or the plugin's child bridge.
7. Open the plugin settings again to review the discovered devices and their options.

If no devices are listed in the configuration, all supported devices in the LG account are added. Add device entries only to rename devices, change device options, or add only some devices.

If you sign in to LG with Google, Apple, or another external account, get the refresh token with the [`thinq auth`](#command-line-tool) command or follow the [Plugin Authorization Setting](https://github.com/nVuln/homebridge-lg-thinq/wiki/Plugin-Authorization-Setting) guide of the original project.

### Manual configuration

Add the platform to the `platforms` section of your Homebridge `config.json`:

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

To add only some devices, or to set device options, list the devices by id:

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
      "name": "Laundry Room Washer",
      "washer_trigger": true
    }
  ]
}
```

Device ids are shown in the Homebridge log when the plugin discovers devices.

### Platform options

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `platform` | Yes | | Must be `LGThinQ`. |
| `auth_mode` | Yes | `account` | `token` to sign in with a refresh token, or `account` to sign in with username and password. |
| `refresh_token` | With `token` | | Refresh token from the LG login (Homebridge UI or `thinq` command). |
| `username` | With `account` | | LG ThinQ account username. |
| `password` | With `account` | | LG ThinQ account password. |
| `country` | Yes | `US` | Country of the LG account, as an ISO 3166-1 alpha-2 code, for example `US` or `ES`. |
| `language` | Yes | `en-US` | Language of the LG account, for example `en-US` or `es-ES`. |
| `devices` | No | all devices | Devices to add, with their options. Empty or missing adds all supported devices. |
| `thinq1` | No | `false` | Advanced. Set to `true` to add legacy ThinQ1 devices. |
| `refresh_interval` | No | `60` | Seconds between status refreshes from LG. ThinQ2 devices also get instant updates, so this is only a fallback for them; ThinQ1 devices are updated only by this refresh. Low values can make LG reject requests with HTTP 429 (too many requests). Not shown in the Homebridge UI. |

### Device options

Every device entry accepts `id` (required), `name`, and `serial_number`. The options below depend on the device type. The Homebridge UI shows only the options that apply to each discovered device.

#### Air Conditioner

| Option | Default | Description |
| --- | --- | --- |
| `ac_mode` | `BOTH` | Modes shown in HomeKit: `BOTH`, `COOLING`, or `HEATING`. |
| `ac_swing_mode` | `BOTH` | Swing directions to control: `BOTH`, `VERTICAL`, `HORIZONTAL`, or `NONE`. |
| `ac_temperature_unit` | `C` | Temperature unit of the AC: `C` or `F`. |
| `ac_air_quality` | `false` | Add an air quality sensor, if the AC has one. |
| `ac_temperature_sensor` | `false` | Add the current temperature as a separate sensor. |
| `ac_humidity_sensor` | `false` | Add a humidity sensor. |
| `ac_led_control` | `false` | Add a switch for the display light. |
| `ac_fan_control` | `false` | Add a separate fan control. |
| `ac_jet_control` | `false` | Add a switch for jet mode. |
| `ac_energy_save` | `true` | Add a switch for energy saving. |
| `ac_air_clean` | `true` | Add a switch for air purification. |
| `ac_buttons` | `[]` | Extra switches for operation modes, as `{ "name": "...", "op_mode": number }`. |

#### Washer and Dryer

| Option | Default | Description |
| --- | --- | --- |
| `washer_trigger` | `false` | Add a sensor that triggers when a program finishes, for automations. |
| `washer_tub_clean` | `false` | Add a sensor for the tub clean reminder. |
| `washer_door_lock` | `false` | Add the door lock status (ThinQ2 only). |

#### Dishwasher

| Option | Default | Description |
| --- | --- | --- |
| `dishwasher_trigger` | `false` | Add a sensor that triggers when a program finishes, for automations. |

#### Refrigerator

| Option | Default | Description |
| --- | --- | --- |
| `ref_express_freezer` | `false` | Add a switch for Express Freezer or Ice Plus. |
| `ref_express_fridge` | `false` | Add a switch for Express Fridge. |
| `ref_eco_friendly` | `false` | Add a switch for Eco Friendly mode. |

#### Air Purifier

| Option | Default | Description |
| --- | --- | --- |
| `air_fast_mode` | `false` | Add a switch for fast mode. |

## Troubleshooting

Turn on Homebridge **debug mode** (Homebridge UI → Settings) to see detailed logs, and consider running the plugin in its own **child bridge**.

| Problem | What to do |
| --- | --- |
| `LG pre-login failed: Request failed with status code 403` | LG rejected the login request. Update to version `2.0.3` or later. |
| `Request failed with status code 429` or result code `9012` | LG received too many requests. Update to version `2.0.6` or later, and do not set a low `refresh_interval`. |
| `Missing required config parameter.` | Set `country`, `language`, and either a `refresh_token` or `username` and `password`. |
| `The plugin requires a Node.js version of ...` | Update the plugin. Node.js 26 also needs Homebridge `2.3.0` or later. |
| A device is missing | Check that it works in the LG ThinQ app. Legacy devices need `"thinq1": true`. If it is still missing, [request it](https://github.com/santiagosony/homebridge-lg-thinq-2/issues/new/choose). |

When you report a problem, include the plugin version, Homebridge and Node.js versions, country, language, device type and model, and the debug log. Remove tokens, passwords, and other personal data first.

## Command-line tool

The plugin includes a `thinq` command to get a refresh token outside the Homebridge UI. It is available when the plugin is installed globally with npm.

```text
Usage: thinq [options] [command]

Options:
  -c, --country <type>         Country code for account (default: "US")
  -l, --language <type>        Language code for account (default: "en-US")
  -h, --help                   display help for command

Commands:
  login <username> <password>  Obtain refresh_token from LG account
  auth                         Obtain refresh_token from account logged by
                               Google Account, Apple ID
  help [command]               display help for command
```

For example, for an account in Spain:

```sh
thinq -c ES -l es-ES auth
```

## Development

You need Node.js 22, 24, or 26.

```sh
git clone https://github.com/santiagosony/homebridge-lg-thinq-2.git
cd homebridge-lg-thinq-2
npm ci
npm run build
npm run lint
npm test
```

| Script | What it does |
| --- | --- |
| `npm run build` | Compiles TypeScript from `src/` to `dist/`. |
| `npm run lint` | Runs ESLint with no warnings allowed. |
| `npm test` | Runs the Jest test suite. Some tests call the LG servers and need internet access. |
| `npm run watch` | Builds, links the plugin into your local Homebridge, and rebuilds on changes. |

### Releases

Releases are automated with GitHub Actions:

1. Add the changes to `CHANGELOG.md` under a new `## vX.Y.Z` heading.
2. Update the version in `package.json` and `package-lock.json`, for example with `npm version patch --no-git-tag-version`.
3. Push to `main`.

The [publish workflow](.github/workflows/publish.yml) then lints, builds, and tests the plugin, publishes it to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) and provenance (no npm tokens are stored), and creates the `vX.Y.Z` tag and a GitHub release with the notes from the changelog. Pushes that do not change the version only run the checks.

## Contributing and support

- **Bugs and device requests:** open an [issue](https://github.com/santiagosony/homebridge-lg-thinq-2/issues/new/choose).
- **Questions and ideas:** start a [discussion](https://github.com/santiagosony/homebridge-lg-thinq-2/discussions).
- **Contributions:** read the [contributing guide](CONTRIBUTING.md). This project follows a [code of conduct](CODE_OF_CONDUCT.md).
- **Security issues:** follow the [security policy](SECURITY.md); do not report them in public issues.

Please do not report problems with this version in the original repository.

## Credits

- [nVuln](https://github.com/nVuln), who created [homebridge-lg-thinq](https://github.com/nVuln/homebridge-lg-thinq), and all of its contributors. The full commit history of the original project is kept in this repository.
- [carlosgamezvillegas](https://github.com/carlosgamezvillegas), for the Oven and Microwave support ([nVuln/homebridge-lg-thinq#87](https://github.com/nVuln/homebridge-lg-thinq/issues/87)).
- [ZeliardM](https://github.com/ZeliardM), for the Homebridge 2 and Node.js 24 work in the original repository.
- The authors of pull requests that were never merged in the original repository and are included here: [vojkny](https://github.com/vojkny) ([#401](https://github.com/nVuln/homebridge-lg-thinq/pull/401)), [faune](https://github.com/faune) ([#395](https://github.com/nVuln/homebridge-lg-thinq/pull/395)), [pharmville](https://github.com/pharmville) ([#400](https://github.com/nVuln/homebridge-lg-thinq/pull/400)), and [asafdav](https://github.com/asafdav) ([#394](https://github.com/nVuln/homebridge-lg-thinq/pull/394)).

See [CHANGELOG.md](CHANGELOG.md) for the changes in each version.

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution and third-party components.

LG and ThinQ are trademarks of LG Electronics. This project is not affiliated with, endorsed by, or sponsored by LG Electronics. Homebridge is not affiliated with this project.
