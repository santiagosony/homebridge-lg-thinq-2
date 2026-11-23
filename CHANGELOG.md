# Change Log

## v2.0.16

### Dependencies

* Updated `commander` to 15.1.0 (used by the `thinq` command) and `@homebridge/plugin-ui-utils` to 2.3.0 (used by the settings screen). Both were checked: the `thinq` command behaves the same on Node.js 22, 24, and 26, and the settings screen works in Homebridge UI 5.30.1.
* Updated the build and test tools (jest, ts-jest, rimraf, type definitions) and the GitHub Actions (`actions/checkout` 7.0.1, `actions/setup-node` 7.1.0). jest 30.5 brought a `minimatch` version with a moderate advisory through `test-exclude`; it is overridden to a fixed version, so `npm audit` still reports 0 vulnerabilities.
* The Node.js type definitions now follow Node.js 22, the oldest supported version, so the code cannot use newer Node.js APIs by mistake. Dependabot no longer proposes major updates of them, nor TypeScript 7, which the test and lint tools do not support yet.

## v2.0.15

### Homebridge UI

* Fixed the **Plugin Logs** window of the Homebridge UI always being empty. It shows the log lines whose prefix is the platform `name` in the config, and without a `name` it looked for `homebridge-lg-thinq-2`, while Homebridge prefixes this plugin's lines with `LGThinQ`. The config now has `"name": "LGThinQ"` by default: the settings screen adds it to existing configs (click **Save** once), and the README examples include it. Verified in Homebridge UI 5.30.1.

## v2.0.14

### Reliability

* The MQTT root certificate and client certificate received from LG are now validated before they are written to disk: they must be PEM certificates that parse as X.509, with no other content. If LG or the certificate host returns something else, such as an error page, the plugin logs a clear error, writes no file, and retries later, instead of saving it as a certificate and failing with a TLS error. Checked against the real AWS and LG root certificates.
* Known issue: the legacy root certificate URL (VeriSign G5, only used for MQTT hosts that are neither AWS IoT nor LG) now redirects to the DigiCert home page. It is now reported as an invalid certificate instead of being saved.

## v2.0.13

### Security

* Fixed the host name checks that pick the root certificate for the MQTT connection: the dots in the patterns were not escaped, so they matched any character and host names that only looked like AWS IoT or LG hosts. Found by CodeQL.
* When migrating cache files from older versions, each file is now checked and read through the same open file, so it cannot be replaced in between. Found by CodeQL.

### Development

* Hardened the GitHub Actions workflows: the CI workflow now has a read-only token, actions are pinned to commit SHAs, dependencies are installed without running their install scripts (`npm ci --ignore-scripts`), jobs have time limits, and newer pushes to a pull request cancel older checks.
* Added Dependabot version updates for npm and GitHub Actions (weekly, development dependencies grouped), and CodeQL code scanning for JavaScript and TypeScript.

## v2.0.12

### Homebridge UI

* The settings of each device type are now shown open instead of in a collapsed section. They were collapsed when every device showed the settings of all device types; now each device shows only its own, so collapsing them only added a click.

## v2.0.11

### Login

* The LG sign-in lock message is now recognized only by the prefix LG uses (`Need Sign-In Unlock`, optionally followed by colon-separated fields), instead of anywhere in any message. The fields after the prefix, which identify the account, are never shown or logged.
* The tests now use made-up account data only.

## v2.0.10

### Homebridge UI

* Fixed the "Device Settings" section of each device showing only its title, with no options. The settings for each device type (washer and dryer, air conditioner, refrigerator, air purifier, dishwasher) are shown only when the device `type` matches, but `type` was not declared in `config.schema.json`, so the Homebridge UI dropped it and no settings ever showed. Verified in Homebridge UI 5.30.1 that each device shows its own settings and that changes are saved. Added a test that checks every device field used by the settings conditions is declared.

## v2.0.9

### Login

* When LG locks sign-in for an account (LG message `Need Sign-In Unlock`, usually after several failed sign-ins or a sign-in from a new device), the Homebridge UI, the `thinq` command, and the log now explain what happened and how to unlock it, instead of showing LG's raw message. Documented the error in the README troubleshooting table.

## v2.0.8

### Security

* The plugin no longer writes LG credentials to the Homebridge log. When refreshing the access token failed, the error was logged with its request body, which contains the refresh token; other errors could include the access token, or the username and password hash after a failed login. Errors are now logged as a short description (type, message, HTTP status, LG code, and URL without query parameters). Users often share these logs in public issues.
* The MQTT private key (`key.pem`) is now readable only by the user that runs Homebridge (mode 600, folder 700). Before, any user on the machine could read it. Existing files are fixed on the next start.
* When LG requires new terms, the plugin now loads the terms of the account's country and language (it always used Vietnam), and logs which terms it accepted on the account's behalf instead of accepting them silently.

### Reliability

* A command that failed while the plugin was not waiting for it (microwave and oven commands, and AC mode buttons), for example because LG reported the device as offline, was an unhandled promise rejection, and Homebridge shuts down on those. These commands now log the error instead. Added lint rules (`no-floating-promises`, `no-misused-promises`) so the problem cannot come back.

### Development

* Updated development dependencies to clear all `npm audit` reports and Dependabot alerts (16, from critical to low): `handlebars`, `js-yaml`, `browserslist`, `baseline-browser-mapping`, `@babel/core`, `eslint`, `typescript-eslint`, `@humanfs/node`, and `minimatch`. `nodemon` is given `minimatch` 11 through an override, because every 10.x release is affected and nodemon still asks for 10.x. These packages are only used to build and test the plugin and are not part of the published package.

## v2.0.7

### Security

* Removed jQuery 3.2.1, Bootstrap 4.0.0, and Popper.js from the plugin settings screen in the Homebridge UI. These 2017-2018 versions have known cross-site scripting vulnerabilities, and the screen only used them for two collapsible panels and basic page updates. The screen now uses plain JavaScript and the Bootstrap 5 styles that the Homebridge UI already provides, and behaves the same. The package is about 137 kB smaller.
* The settings screen no longer breaks when the saved country or language contains unexpected characters, and the username label is linked to its field again.

### Documentation

* Rewrote the README: supported devices, requirements, installation, migration, all platform and per-device options with their defaults, troubleshooting for common errors, the `thinq` command, development and release process, and credits.
* Added a contributing guide, a security policy (private reporting through GitHub), and a code of conduct (Contributor Covenant 2.1).
* Replaced the issue templates with issue forms for bug reports and device requests, sent questions to Discussions, and added a pull request template.
* Added copyright lines to `NOTICE`.
* Removed the funding file, which pointed to the original author's donation page.

## v2.0.6

### Reliability

* The default refresh interval is now 60 seconds, matching `config.schema.json`, instead of 5 seconds. The plugin asked LG for the full device list every 5 seconds as a fallback to MQTT, and LG now answers that with HTTP 429 (result code `9012`, "Please consider using the official API"). Invalid or zero values also fall back to 60 seconds. From [nVuln/homebridge-lg-thinq#395](https://github.com/nVuln/homebridge-lg-thinq/pull/395) by Frank Aune, fixing [nVuln/homebridge-lg-thinq#385](https://github.com/nVuln/homebridge-lg-thinq/issues/385).
* ThinQ1 devices, which only get updates from this refresh, now update every 60 seconds unless `refresh_interval` is set in the config.
* Documented the `refresh_interval` option in the README. The Homebridge UI does not show it, so it is set by editing the config JSON.

## v2.0.5

Fixes from [nVuln/homebridge-lg-thinq#401](https://github.com/nVuln/homebridge-lg-thinq/pull/401) by Vojtech Knyttl, which was never merged in the original repository.

### Air Conditioner

* The fan speed control now uses LG's own 5 speeds (HomeKit values 1 to 5) instead of a 0 to 100 percentage. With the percentage, most slider positions mapped to the speed the AC was already using, so the control seemed stuck and snapped back. Now every position selects a different speed. HomeKit speed 0 selects the lowest speed, because turning the AC off is a separate control.

### Devices

* The accessory name shown in HomeKit now follows the device name. Before, a device renamed in the ThinQ app or in the plugin config kept showing its old name in the Home app.

### Logging and Reliability

* Commands that a device rejects as not supported (ThinQ result codes `0101` and `9006`), such as the AC temperature keep-alive on some models, are now logged at debug level instead of as errors, which flooded the log every few minutes ([nVuln/homebridge-lg-thinq#391](https://github.com/nVuln/homebridge-lg-thinq/issues/391)).
* When ThinQ does not return an MQTT certificate, the plugin now logs a clear error and retries, instead of failing with `Cannot read properties of undefined (reading 'certificatePem')`.

### Dependencies

* Cleared all known vulnerabilities in the published package's dependencies (`npm audit --omit=dev` reports 0, was 9): `node-forge` 1.4.3, `qs` 6.17.1, and overrides for `ws` 8.23.0, `glob` 14.0.6, and `brace-expansion` 5.0.13. `ws` is forced to 8.x for `aws-iot-device-sdk` and `mqtt`, which pin a vulnerable 7.x; the plugin connects to MQTT over TLS, not websockets, and was verified to still connect.

## v2.0.4

### Dependencies

* Raised the minimum axios version to 1.21.1 (was 1.16.0). axios versions before 1.16.1 send HTTPS requests to an HTTPS proxy as plain requests instead of opening a `CONNECT` tunnel, so proxies reject them (HTTP 405). With 1.21.1, requests through an `HTTPS_PROXY` work. Installs from npm already resolved to a newer axios, so this mainly guarantees the plugin never runs with an affected version.
* The axios update also brings patched `follow-redirects` and `form-data` versions, and lowers the dependency issues reported by `npm audit` for the published package from 12 to 9 (high: from 6 to 3). The remaining ones come from `aws-iot-device-sdk` (through `mqtt` and `glob`).

## v2.0.3

### Login

* Fixed LG account login failing with `LG pre-login failed: Request failed with status code 403`. LG's account servers now reject requests that identify as axios (the default `axios/<version>` User-Agent), so all plugin requests send a browser User-Agent unless they set their own. Requests to the ThinQ API keep their `okhttp` User-Agent. This affects login from the Homebridge UI, the `thinq` CLI, and username/password config. Based on [nVuln/homebridge-lg-thinq#400](https://github.com/nVuln/homebridge-lg-thinq/pull/400), fixing [nVuln/homebridge-lg-thinq#402](https://github.com/nVuln/homebridge-lg-thinq/issues/402).
* Added tests that run the login against a local server that rejects the axios User-Agent like LG does.

## v2.0.2

### Packaging and Releases

* Declared the `supports-hap` keyword, so the Homebridge UI knows the plugin publishes accessories over HAP (HomeKit).
* Limited the published package to what the plugin needs at runtime with the `files` field in `package.json`: source maps, TypeScript declaration files, and sample data are no longer shipped (208 files and 257 kB before, 74 files and 149 kB now). Removed the redundant `.npmignore`.
* Each version published to npm now gets a GitHub release, with notes taken from this changelog.

## v2.0.1

### Compatibility

* Added Node.js 26 support (`engines.node` is now `^22.13.0 || ^24.0.0 || ^26.0.0`), so Homebridge no longer warns that the plugin does not support Node.js 26. Node.js 26 requires Homebridge 2.3.0 or later.
* Verified on Node.js 26.13.1: lint, build, and unit tests pass, and the plugin loads and runs in Homebridge 2.5.0 without deprecation warnings. The CLI and the Homebridge UI server also start correctly.
* Added Node.js 26 to the CI test matrix.
* Updated the Homebridge development dependency to 2.5.0, so tests run against a Homebridge version that supports Node.js 26.

## v2.0.0 (first release as homebridge-lg-thinq-2)

### Project

* Continued the project as `homebridge-lg-thinq-2`, based entirely on [nVuln/homebridge-lg-thinq](https://github.com/nVuln/homebridge-lg-thinq), because the original repository stopped receiving updates. The original commit history is preserved.
* Updated package name, repository, issue tracker, and homepage references to the new repository, and added attribution to the original project in the README, `NOTICE`, and `package.json`.
* Changed the internal plugin name to `homebridge-lg-thinq-2`. The platform name (`LGThinQ`) and config format are unchanged, so existing configs keep working.
* Development of this version is assisted by Claude (Anthropic's AI assistant).

All entries below were released as `homebridge-lg-thinq` by the original authors.

## v2.0.0

### Compatibility and Packaging

* Added Homebridge 2 compatibility work while keeping support for current Homebridge 1.x releases.
* Updated runtime support for Homebridge's Node 22 and Node 24 lines, dropping Node 20.
* Modernized the TypeScript 6, ESLint 10, and Jest setup.
* Removed the direct `homebridge-config-ui-x` runtime dependency and kept the plugin UI on `@homebridge/plugin-ui-utils`.
* Updated dependencies and overrides to clear `npm audit` issues.
* Cleaned package output so compiled specs, internal test files, and local planning artifacts are not published.

### Homebridge UI and Setup

* Updated the custom UI login flow so token login updates the pending Homebridge config and leaves the Homebridge UI Save button as the source of truth.
* Added clearer UI login/device lookup logging and preserved useful root-cause errors from LG auth/network failures.
* Fixed the setup flow after login: users now save through the Homebridge UI and restart Homebridge or the child bridge before device configuration loads.
* Fixed the initial settings load so a blank `new device` tab is not shown while discovered devices are still loading.
* Fixed serial number display so missing serials are blank instead of `undefined`.
* Fixed configured device names so they apply during discovery and update restored cached accessories.
* Removed confusing in-UI text about leaving device config empty and hid the legacy ThinQ1 checkbox from the normal UI.
* Removed the device type selector from the normal UI; device-specific settings now use LG discovery data.

### Runtime Reliability

* Fixed request throttling so failed translated requests release their request slot.
* Preserved network/auth error causes through request and login handling.
* Fixed ThinQ device discovery so device-list failures are no longer treated as an empty account, avoiding accidental stale accessory removal during transient LG/API failures.
* Split platform startup, discovery decisions, accessory reconciliation, event listener management, and monitor startup into focused helpers.
* Added shutdown cleanup for monitor intervals and device update listeners.
* Hardened MQTT setup and runtime event handling, including certificate setup helpers, retry behavior, reconnect wiring, and invalid MQTT payload logging.
* Fixed persistence caching so valid falsy cached values are not treated as misses.
* Improved session expiry helper behavior.

### Device Handling

* Reworked Air Conditioner state parsing, HomeKit service setup, feature toggles, fan/swing/mode handling, target temperature behavior, temperature ranges, and keep-alive behavior.
* Improved Oven and Microwave shared cooking helpers for timers, alarms, probe/current/target temperatures, vent/lamp controls, remote start commands, and visibility updates.
* Improved Dishwasher, Refrigerator, Washer/Dryer, Styler, Range Hood, Dehumidifier, Air Purifier, and AeroTower state parsing and HomeKit characteristic updates.
* Improved command payload coercion for model-aware `Bit`, `Range`, and `Enum` values.
* Improved ThinQ1 monitor work-id handling, transform selection, and control payload preparation.
* Kept the supported-device matrix behavior-preserving while making device code easier to reason about and test.

### Tests

* Added focused unit tests for platform helpers, request/auth/API boundaries, MQTT setup/runtime handling, ThinQ1 monitor behavior, command payload coercion, persistence/session helpers, and device state helpers.
* Removed duplicate test suites after preserving equivalent coverage in canonical colocated specs.
* Kept the unique ThinQ integration/coercion coverage.
* Excluded specs from the TypeScript build output and added repeatable coverage summary output.

## v1.8.11

* Fixed bugs and added Homebridge 2 readiness work from #341.
* Updated npm dependencies.

## v1.8.10

* Added Air Conditioner jet control configuration from #322.

## v1.8.9

* Fixed refrigerator water filter handling.

## v1.8.8

* Fixed Air Purifier light handling from #299.
* Updated package author metadata.

## v1.8.7

* Fixed an error introduced around the AC customization options work from #295.

## v1.8.6

* Added Air Conditioner options to disable Energy Save and Air Clean switches.

## v1.8.5

* Improved Air Conditioner temperature updates by using the control endpoint.
* Only sends AC control requests for online AC devices.
* Fixed and then reverted the default threshold temperature step change.
* Removed leftover console statements.
* Fixed washer door lock status on some new washers.

## v1.8.4

* Fixed Air Conditioner temperature range handling.

## v1.8.3

* Fixed Air Conditioner temperature detection from #285.

## v1.8.2

* Fixed Air Conditioner temperature range auto-detection using the device model.
* Included additional bug fixes.

## v1.8.1

* Corrected device model handling for a new kind of washer.
* Fixed AWHP warning message from #213.

## v1.8.0

### Washer is fixed now

* Washer should appear in the Home app now.
* Resetting the Homebridge accessory cache is required to make it work.

### New Device Supported

* New kind of washer is supported also (device type 223).

## v1.7.0

- fix: washer service name  a9fa96a
- fix: air purifier service name  6a7937f
- fix: refrigerator service name  4faca7f
- fix: AC warning message  b53642d
- add: refrigerator water filter status #260  d0ef884
- fix: dishwasher crashed #270  7efddaf
- fix: AC temperature not updated #177  e934f81
- revert: server.js in custom UI  e11b2a6
- fix: retrieve sale model if possible #275  d6df494

## v1.6.0

### New Device Supported

* Oven
* Microwave

## v1.5.0

### IMPORTANT: AC temperature unit need to be set in plugin setting

- if your AC is in Fahrenheit, please change it in plugin setting to make sure the temperature value is correct, otherwise it will be converted to Celsius by default.
- in previous version, the temperature unit is auto detected, but it's not reliable, so we have to change it to manual setting.

## v1.4.0

- fix: AC humidity value on some device #224  c4227b4
- add: custom characteristic for AC energy consumption #222  6b36c7a
- add: dishwasher data sample  3805ce1
- enable refrigerator door sensor on thinq 1  1d99daf
- fix: Washer tub clean coach event triggered multiple times  aaa8920

## v1.3.0

### New Device Supported

* Range Hood
* AeroTower

### Bug fixes

* Air Conditioner fahrenheit unit (US region)
* Washer/Dryer as water faucet appear again on ios 16

### New feature

* Filter status on Air Purifier
* Tub clean event on Washer/Dryer (trigger at 30 cycle)

## v1.2.0

### Changes

* Real-time device data update via MQTT (thinq2 only)
* More device support

### Bug fixes

* Update login workflow: preLogin step

### Other Changes

* Washer door lock disable by default, need enable it in plugin setting
* Refrigerator: Express Freezer (Ice Plus), Express Fridge, Eco Friendly
* UI device list: changed to tabarray

## v1.1.0

### Changes

* AC supported
* Refrigerator thinq1

### Bug fixes

* washer program finished trigger (as Occupancy Sensor)
* thinq1 device monitor

## v1.0.0

### stable release

* config UI with 3rd party login support (Google, Facebook ...)
* devices support: Air Purifier, Dehumidifier, Dishwasher, Refrigerator, Washer & Dryer
* more device support in future
