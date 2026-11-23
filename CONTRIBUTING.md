# Contributing

Thanks for helping improve Homebridge LG ThinQ 2. This project continues [nVuln/homebridge-lg-thinq](https://github.com/nVuln/homebridge-lg-thinq), and contributions of any size are welcome: bug reports, device data, documentation, and code.

By taking part in this project you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and requesting devices

- Search the [existing issues](https://github.com/santiagosony/homebridge-lg-thinq-2/issues) first.
- Use the [issue forms](https://github.com/santiagosony/homebridge-lg-thinq-2/issues/new/choose): they ask for the versions and logs needed to investigate.
- Turn on Homebridge debug mode before collecting logs.
- **Remove personal data** before posting: refresh tokens, passwords, email addresses, device ids you do not want to share, and serial numbers.
- Report security problems privately, as described in the [security policy](SECURITY.md).

Questions and ideas are welcome in [Discussions](https://github.com/santiagosony/homebridge-lg-thinq-2/discussions).

## Development setup

You need Node.js 22, 24, or 26 and npm.

```sh
git clone https://github.com/santiagosony/homebridge-lg-thinq-2.git
cd homebridge-lg-thinq-2
npm ci
npm run build
```

To try your changes in a local Homebridge, run `npm run watch`. It links the plugin into your global npm folder and rebuilds it when files change.

The `sample/` folder has anonymized device data from the LG API, useful to write tests for device types you do not own.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Keep each pull request focused on one change.
3. Add or update tests in the `*.spec.ts` file next to the code you change. Bug fixes should include a test that fails without the fix.
4. Run the checks before opening the pull request:

   ```sh
   npm run lint
   npm run build
   npm run test:coverage
   ```

   The tests run offline. They must not depend on LG servers: [`test/blockNetwork.ts`](test/blockNetwork.ts) makes any connection to an outside server fail, so fake LG's answers instead (see `fakeLg` in `src/lib/API.spec.ts`). The coverage check fails if coverage drops below the thresholds in `jest.config.ts`.

5. Add a short entry to `CHANGELOG.md` describing the change for users.
6. Open a pull request and fill in the template.

Pull requests run the same checks on Node.js 22, 24, and 26 in GitHub Actions.

## Code style

- TypeScript, checked by ESLint (`npm run lint`, no warnings allowed).
- Catch and log errors instead of letting them crash Homebridge.
- Write files only inside the Homebridge storage folder (`api.user.storagePath()`).
- Follow the [Homebridge plugin guidelines](https://developers.homebridge.io/#/publishing).

## Releases

Maintainers release new versions by updating the version in `package.json` and pushing to `main`. The publish workflow then publishes the package to npm and creates the GitHub release. See [Releases](README.md#releases) in the README.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE), the license of this project.
