# Changelog

## 0.1.1 — 2026-10-11

- Fix favourite song playback grouped by album restarting a finished album
  when groups share album metadata. Group matching now uses exact song
  membership so playback advances in the selected browse order.
- Add numeric totals beside the Albums, Songs, Artists, Album Artists,
  Composers, Playlists and More filter headers, separated by a vertical line.
- Update totals for full-library and favourite selections. Song totals remain
  accurate when songs are grouped by album, and artist totals follow the
  selected artist panel. No redundant labels follow the numbers.
- Refresh frontend asset versions so browsers load the updated UI.
- Remove secondary descriptions from dropdown choices to keep every menu compact.
- Validate with 72 automated tests and local browser checks.
