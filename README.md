# DNB Theme build setup

This folder is intended to live at `freshrss/freshrss-theme` in the following local layout:

```text
freshrss/
  config/
  freshrss-theme/
  FreshRSS/
```

A sample implementation (with docker-compose.yaml) can be found [in my dotfiles repository](https://github.com/davidsneighbour/dotfiles/tree/main/containers/locutus/freshrss).

## What each folder does

* `config/` is mounted into Docker as your FreshRSS config folder (might differ per setup)
* `freshrss-theme/` is the custom theme project and is mounted into the container's themes directory.
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






## Project structure

```text
freshrss/
├── config/              # mounted into container (FreshRSS config)
├── freshrss-theme/      # Tailwind-based theme (mounted, https://github.com/davidsneighbour/freshrss-theme)
├── FreshRSS/            # cloned FreshRSS repo (reference only, https://github.com/FreshRSS/FreshRSS)
```

## Theme development workflow

* The theme is developed in `freshrss-theme/`
* Tailwind runs locally and builds CSS into the theme directory
* Docker only consumes the compiled output
* In case of changes not being loaded in FreshRSS - "Did you reboot the container?"

Flow:

```text
src/css → Tailwind build → base.css → Docker → FreshRSS UI
```

## Tailwind build commands

Run inside `freshrss-theme/`:

Install dependencies:

```bash
npm install
```

Build once:

```bash
npm run build:css
```

Watch mode:

```bash
npm run watch:css
```

Stylelint (optional cleanup):

```bash
npm run lint:css
npm run lint:css:fix
```

## Tailwind integration approach

FreshRSS themes are not designed for utility-first HTML usage. Therefore:

* You **do not** sprinkle Tailwind classes into PHP templates
* You **do not** modify core FreshRSS templates

Instead, use:

* `@apply` inside your CSS to compose utilities into existing selectors

Example:

```css
.item {
  @apply flex items-center gap-2 p-2;
}
```

This keeps:

* compatibility with upstream FreshRSS
* clean separation between structure (PHP) and styling (CSS)

## Content scanning

Tailwind scans:

* your theme files (`dnb-theme/`)
* the cloned FreshRSS repo (`freshrss-repo/`)

This allows:

* awareness of existing markup
* better utility generation coverage

## Important notes

### Theme is a copy, not the runtime source

Your theme is based on files copied from the FreshRSS repository.

This means:

* upstream changes are **not automatically reflected**
* your theme can drift from the current FreshRSS version

### Keep reference repo updated

Regularly update your reference:

```bash
cd freshrss-repo
git pull
```

Then:

* review changes in `p/themes/base-theme`
* selectively update your theme if needed

### Do not edit container files

Avoid:

* editing files inside Docker
* copying files from running containers

Always:

* work locally
* rebuild via Tailwind
* let Docker consume mounted files

### Tailwind limitations

Because templates are not Tailwind-driven:

* Tailwind cannot infer all classes automatically
* you may need:

  * `@apply`
  * a safelist file
  * explicit utility usage in CSS
