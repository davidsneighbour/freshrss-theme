# DNB Theme build setup

This folder is intended to live at `freshrss/dnb-theme` in the following local layout:

```text
freshrss/
  config/
  dnb-theme/
  freshrss-repo/
```

## What each folder does

* `config/` is mounted into Docker as your FreshRSS config folder.
* `freshrss-theme/` is your custom theme project and is mounted into the container's themes directory.
* `FreshRSS/` is a local clone of the FreshRSS repository. It is not mounted into Docker. It is only used as a reference tree and as an input source for Tailwind scanning.

## Why the Tailwind scan points outside the theme

Tailwind CLI can only scan files that exist on the machine where the CLI runs. In this workflow the CLI runs in `freshrss-theme/`, so it scans:

* local theme source files in `freshrss-theme/`
* the local FreshRSS clone in `../FreshRSS/`

That gives Tailwind access to the FreshRSS PHP and template files without needing to look inside the running container.

## Config file

`theme.config.json` is preconfigured for this layout:

```json
{
  "input": "./src/css/base.css",
  "output": "./base.css",
  "content": [
    "./metadata.json",
    "./src/**/*.{css,ts,js,txt}",
    "./theme/**/*.{php,phtml,html,twig,js}",
    "../freshrss-repo/p/**/*.{php,phtml,html,twig,js}",
    "../freshrss-repo/app/**/*.{php,phtml,html,twig,js}"
  ],
  "watch": [
    "./metadata.json",
    "./src/**/*.{css,ts,js,txt}",
    "./theme/**/*.{php,phtml,html,twig,js}",
    "../freshrss-repo/p/**/*.{php,phtml,html,twig,js}",
    "../freshrss-repo/app/**/*.{php,phtml,html,twig,js}"
  ]
}
```

## Output model

* Author your CSS in `src/css/base.css`.
* The build writes the compiled file to `base.css` in the theme root.
* FreshRSS keeps loading `frss.css` and `base.css` from `metadata.json`.

## Commands

Install dependencies:

```bash
npm install
```

Build once:

```bash
npm run build:css
```

Watch and rebuild:

```bash
npm run watch:css
```

Lint manually:

```bash
npm run lint:css
```

## Docker mount idea

Mount only your custom theme into the container, not the whole reference repo. The exact container path depends on your compose file, but the FreshRSS documentation places themes under `p/themes/<theme-name>`. See the FreshRSS theme installation docs for the canonical location.

## Notes

* `src/tailwind-safelist.txt` is included so class names that are not easy to detect are kept.
