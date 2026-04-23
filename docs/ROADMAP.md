# Roadmap

Tracked items beyond v0.1.0, loosely ordered by where they deliver the most
user value per unit of effort. No promises, no dates.

## Near-term (v0.2.x–v0.3.x, single-weekend projects)

- [ ] **Evaluate firebase removal.** `firebase@10.14.1` ships in the renderer
      bundle (transitive of the original UI). It accounts for most of the 22
      npm-audit findings. If the mosque-display modes we care about don't
      exercise it, pulling the firebase client out is a large security and
      size win. Need to instrument the running app and confirm.
- [ ] **Replace the placeholder `<PLACEHOLDER_USERNAME>` in
      `package.json.build.publish.owner`** with a real GitHub owner once the
      public repo exists. Flagged in `docs/RELEASE.md`.
- [ ] **First real GitHub release (v0.1.0)** — follow `docs/RELEASE.md`, watch
      CI, install on a secondary machine, verify auto-update delivers the next
      version.
- [ ] **Operator-facing settings UI in the mobile-control page** — currently
      `prayer-config.json` is edited by hand. Expose the adhan-config fields
      in the already-working phone remote so an imam can change method/madhab/
      location without touching JSON. The mobile-control server is already an
      Express + socket.io app; adding a settings tab is straightforward.
- [ ] **Code-signing cert evaluation.** An EV cert removes the SmartScreen
      "Unknown publisher" warning for new mosques installing Mithnah. Costs
      ~$250–500/yr. Worth it only if adoption justifies it; document the
      decision when it comes up.

## Mid-term (v0.4.x–v0.9.x, multi-weekend projects)

- [ ] **Additional wall views.** Mithnah currently renders a single
      Dashboard (clock + Hijri + next prayer + prayer list + events).
      Add optional views (Qibla indicator, mosque announcement banner,
      Friday khutbah timer) that the caretaker can cycle from the phone.
- [ ] **Expanded method catalog.** Add regional methods that adhan-js doesn't
      expose out of the box (e.g. custom angles + Isha offset combinations
      commonly used by specific regional mosques). Implement as user-supplied
      method profiles in `prayer-config.json`.
- [ ] **Qibla direction** — adhan-js already has `adhan.Qibla`. Surface it as
      a screen or a sidebar indicator that shows the bearing from the current
      configured location to Makkah.
- [ ] **Adhan audio.** Bundle a short adhan clip with clear licensing
      (CC0 or explicit author permission) so the wall can play at prayer
      time. Currently there is no audio output.
- [ ] **Ramadan-mode timetable import.** Many mosques publish their own Iqama
      schedules; accepting a CSV or iCal feed and overriding the calculated
      Iqama times is a common request.

## Long-term (v1.0 and beyond)

- [ ] **Linux build.** electron-builder can target `.AppImage` and `.deb`;
      primary barriers are testing and an x11/wayland smoke pass.
- [ ] **Raspberry Pi target.** A lot of mosques in low-budget deployments run
      displays from a Pi. ARM builds and a specifically-tuned minimal UI would
      be useful.
- [ ] **Companion mobile app.** Native (or capacitor-wrapped) Android app that
      doubles as the phone remote and also shows the mosque schedule. Shared
      prayer-times module with Mithnah means the data always agrees.
- [ ] **Multi-display support.** Running Mithnah on two screens in a mosque
      (e.g. main hall + women's hall) with synchronized state. Currently a
      second instance is independent.
- [ ] **Consolidate `build-output/` into `src/`.** The phone UI
      (`mobile-control.{html,js}`) and vendor assets currently live in
      `build-output/`. Move them under `src/phone/` + `src/vendor/`
      for a cleaner mental model.

## Rejected / not-pursued

- **Code signing via community cert.** No reliable free/community EV cert for
  Windows. Not worth the operational overhead of managing donated certs.
- **Custom prayer-times API hosted by us.** Would add a server dependency and
  run counter to the "works fully offline" design. The adhan library is
  already well-audited; duplicating its math on a server adds no value.
- **Paid tier or any commercial model.** Explicit non-goal — Mithnah stays
  free forever.
