# Security Policy

## Supported versions

Only the latest version of `homebridge-lg-thinq-2` receives security fixes. Please update before reporting a problem.

| Version | Supported |
| --- | --- |
| Latest 2.x release | Yes |
| Older 2.x releases | No |
| `homebridge-lg-thinq` (original package) | No, it is no longer maintained |

## Reporting a vulnerability

**Do not report security problems in public issues or discussions.**

Report them privately through GitHub: open the [Security tab](https://github.com/santiagosony/homebridge-lg-thinq-2/security) of this repository and choose **Report a vulnerability**.

Include:

- A description of the problem and its impact.
- The steps to reproduce it, and the affected versions.
- Any logs or proof of concept, with tokens, passwords, and other personal data removed.

You should get a first answer within 7 days. Once the problem is confirmed, a fix is released as soon as possible and credited to you in the release notes, unless you prefer to stay anonymous.

## Scope

In scope:

- The plugin code, its Homebridge UI, and the `thinq` command.
- How the plugin stores and sends LG credentials and tokens.
- Vulnerable dependencies that affect the published package.

Out of scope:

- The LG ThinQ services and apps. Report those to LG.
- Homebridge itself. Report those to the [Homebridge project](https://github.com/homebridge/homebridge/security).
