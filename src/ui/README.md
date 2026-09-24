# src/ui

Plain-DOM HUD and screens. `createUI(root, kitchen, hooks)` appends `#hud` to `root` (next to `#stage`, which main owns).

```
#hud                      fixed, inset 0, pointer-events none; children with .ui are interactive
  #kitchen-hud            visible during a shift (hidden while a screen is shown)
    #topbar.ui            #clock  #money  #shift
    #tickets.ui           article.ticket[.critic][.low] per active order
                            .ticket-head  .ticket-recipe  .patience > .patience-fill
                            .chips > button.chip.s-{pending|cooking|ready|done} (> .chip-bar for grill/fry)
                            .ticket-actions > button.serve (all steps done) + scrap
    #seats.ui             div.seat.m-{happy|neutral|annoyed|angry|empty} x RESTAURANT.seats
    #mg-chrome.ui         #mg-back (empty slot: main appends its back button)  #mg-title
    #mg-overlay.ui        minigames render controls here; bottom in portrait, right in landscape
  #screens                one of: .screen#title / #summary / #market / #staff (each wraps a .panel)
  #toasts                 div.toast, auto-removed after ~2.2s
```

Layout: portrait = tickets are a snap-scrolling row under the top bar, seats fixed at the bottom.
`min-width: 900px` landscape = tickets become a left column, overlay docks right.

Events consumed from `kitchen.events`: `customer:*`, `order:*` (rebuild tickets/seats), `shift:tick`,
`money`, `cook:warning` (toast). Bars are updated per frame in `update(dt)` from cached elements.
Audio is not owned here; main routes `sfx` events to `createAudio()`.
