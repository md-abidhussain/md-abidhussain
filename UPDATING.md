# How to update this profile

Edit any file directly on github.com (open it, click the pencil, commit). No local setup needed.

## Adding a new project
Copy an existing block under **projects** in `README.md`: a title line ending in `\`, a one-line description ending in `\`, then the tags and links line. Put your strongest project first and keep to the 4–5 you can explain best. Then pin its repo on your profile.

## Showing a project that is still in progress
Add a `### now building` section above **projects** with the same block format, and end its tags line with `· in progress` instead of a live link. Optionally add a checklist under it, one milestone per line:

```
- [ ] milestone one
- [ ] milestone two
```

Change `- [ ]` to `- [x]` as each one is done.

## The lines next to your portrait
They live at the top of `scripts/generate.mjs`, in the `PROFILE` block (`lines` and `footer`). Edit them, commit, and the GitHub Action redraws the header within a couple of minutes.

## Changing the portrait
The portrait is stored as ASCII text in `assets/portrait.txt`. To use a new photo, upload it as `assets/portrait.jpg` (square, head and shoulders, plain background works best) and delete `assets/portrait.txt`. The Action then converts the photo.

## If the stats stop updating
Actions tab → "profile graphics" → if GitHub disabled it, click **Enable workflow**, then **Run workflow**.
