// Branded icons for all 25 themes (v2.28, the five newer ones v2.29): which of the owner's "Branded Icon Packs"
// (assets/theme-icons, see its CREDITS.md and licenses/) each theme uses, and for what.
//   icons   the app's own icon names (tools/icons/icons.mjs) that this theme draws with its branded
//           icon instead: tabs, buttons, notifications, dialogs, Settings and the Voice Studio.
//           Only where the object says what the control does; the rest keep the theme's own icon.
//   mark    the theme's emblem: the Appearance gallery card, Settings' theme chip, section headings.
//   states  the status strip's badge for Tyler's real state (listening, thinking, speaking, paused,
//           waiting, error, ready). A state without one shows no badge.
//   pixel   pixel art: drawn with hard edges.
//   pack    the pack's own key, where it differs from the app's (xbox360 → x360, ps3 → xmb).
//   extra   (v2.30) assets the theme's extras draw by name (c.brand(id)) besides the above.
// Ids that start with source- are from Pack 2 (assets/theme-icons-pack-2): the owner's second pack's
// original artwork, chosen only where it is more faithful than what the theme had, and drawn by
// tools/brand/pack2.py (see its notes, and assets/theme-icons-pack-2/derived/index.json).
// tools/build.mjs turns this and the SVGs into browser-extension/ui-brand.js.
export const BRAND={
 steam:{mark:'steam-mark',
  icons:{chat:'chat',room:'friends',sounds:'headset',setup:'workshop',voice:'headset',squad:'friends',success:'achievement',guide:'download'},
  states:{speaking:'headset',thinking:'download'}},
 classic:{mark:'steam-mark',
  icons:{room:'friends',sounds:'music',setup:'vgui-window',checks:'server',squad:'friends',advanced:'vgui-window',warning:'warning',error:'warning'},
  states:{thinking:'download',waiting:'connection',error:'warning'}},
 tf2:{mark:'tf2-emblem',
  icons:{room:'teleporter',setup:'engineer-wrench',checks:'medic-cross',advanced:'engineer-wrench'},
  states:{listening:'blu-team',speaking:'red-team',thinking:'ubercharge'},
  // v2.30: the class emblems (TF2Stadium's community vectors) on the class caption for each tab.
  extra:['source-class-scout','source-class-engineer','source-class-soldier','source-class-medic','source-class-sniper']},
 cs2:{mark:'counter-strike-mark',
  // v2.30: CS2's own extracted icons where Pack 1 had a drawing of the same thing (defuser, C4, armor)
  // or the app used its plain icon (settings, messages, play/pause/stop); the CT emblem on round wins.
  icons:{chat:'source-ui-message',room:'radar',sounds:'headset',setup:'source-ui-settings',checks:'source-equipment-defuser',voice:'headset',success:'round-win',
   play:'source-ui-play',pause:'source-ui-pause',stop:'source-ui-stop'},
  states:{listening:'radar',thinking:'source-equipment-c4',ready:'source-equipment-armor'},
  extra:['source-ct-logo']},
 portal:{mark:'aperture-iris',
  icons:{room:'companion-cube',checks:'floor-button',voice:'turret',success:'cake'},
  states:{listening:'blue-portal',speaking:'orange-portal',thinking:'aperture-iris',paused:'exit-sign'}},
 cs16:{mark:'counter-strike-mark',
  icons:{sounds:'radio',checks:'defuse-kit',voice:'radio'},
  states:{listening:'crosshair',thinking:'c4-timer',waiting:'rescue'}},
 hev:{mark:'lambda',
  icons:{setup:'black-mesa',checks:'health',advanced:'black-mesa',error:'radiation',warning:'radiation'},
  states:{listening:'geiger',thinking:'battery',error:'radiation',ready:'hev-armor'}},
 l4d:{mark:'left-4-dead-mark',
  icons:{room:'safe-room',checks:'medkit',success:'safe-room',error:'incapacitated'},
  states:{waiting:'rescue',error:'incapacitated',ready:'safe-room',paused:'pills'}},
 winxp:{mark:'windows-flag',
  icons:{room:'folder',sounds:'speaker',setup:'my-computer',checks:'network',voice:'speaker',apps:'windows-flag',error:'error',warning:'error',info:'information'},
  states:{error:'error',waiting:'network'},
  // v2.30: XP's own shell32 icons (their 24 x 24, 32-bit frames) in the Start menu, at that size.
  extra:['source-shell32-4','source-shell32-16','source-shell32-18','source-shell32-24','source-shell32-28']},
 doom:{mark:'doom-game-icon',pixel:true,
  icons:{checks:'health',setup:'armor',warning:'barrel'},
  states:{listening:'blue-keycard',thinking:'yellow-keycard',error:'red-keycard'}},
 quake:{mark:'quake-rune',
  icons:{room:'teleporter',setup:'runestone',checks:'health',voice:'lightning',advanced:'runestone',success:'quad-damage'},
  states:{speaking:'lightning',thinking:'quake-rune',ready:'armor'}},
 pipboy:{mark:'vault-tec',
  icons:{sounds:'radio',setup:'pip-boy-device',checks:'health',voice:'radio',success:'perk-star',warning:'radiation'},
  states:{thinking:'atomic',error:'radiation'}},
 combine:{mark:'combine-insignia',
  icons:{room:'citadel',setup:'civil-protection-mask',checks:'checkpoint',voice:'radio',error:'alert',warning:'alert'},
  states:{listening:'scanner',error:'alert'}},
 deadlock:{mark:'spirit-flame',
  icons:{room:'transit-token',sounds:'spectral-radio',voice:'spectral-radio',info:'art-deco-badge'},
  states:{thinking:'occult-sigil',speaking:'spirit-flame'},
  // v2.30: Deadlock's stat symbols on two shop items (ammo for the Soundboard, health regen for the full check).
  extra:['source-ammo-icon','source-health-regen-icon']},
 minecraft:{mark:'creeper-face',pixel:true,
  icons:{room:'grass-block',sounds:'chest',setup:'pickaxe',checks:'heart',success:'diamond'},
  states:{speaking:'music-disc',waiting:'redstone'}},
 payday:{mark:'payday-2-mark',
  icons:{room:'contract',voice:'pager',info:'pager',error:'assault-badge'},
  states:{thinking:'drill',paused:'stealth-ghost',error:'assault-badge'}},
 dreamcast:{mark:'dreamcast-swirl',
  icons:{sounds:'gd-rom',setup:'controller',checks:'modem',advanced:'memory-card'},
  states:{waiting:'modem',thinking:'clock'}},
 gmod:{mark:'garrys-mod-mark',
  icons:{room:'wireframe-cube',sounds:'spawn-menu',setup:'tool-gun',advanced:'tool-gun'},
  states:{thinking:'physics-gun'},
  // v2.30: Mark James' Silk icons (GMod's Derma menus use them) on the spawn menu's tools, at 16 px.
  extra:['source-silk-lock','source-silk-delete','source-silk-find','source-silk-sound','source-silk-cog']},
 ricochet:{mark:'ricochet-emblem',
  icons:{room:'arena-platform',success:'extra-life'},
  states:{listening:'target',thinking:'ricochet-path',waiting:'jump-pad'}},
 dod:{mark:'game-emblem',
  icons:{room:'compass',sounds:'field-radio',setup:'orders',checks:'field-medic',voice:'field-radio',success:'capture-flag'},
  states:{ready:'helmet',speaking:'field-radio'}},
 // v2.29: the five newer themes.
 rust:{mark:'rust-game-mark',
  icons:{room:'tool-cupboard',setup:'hammer',advanced:'pickaxe',warning:'radiation-barrel',error:'radiation-barrel'},
  states:{thinking:'furnace',paused:'sleeping-bag',error:'radiation-barrel'},
  // v2.30: Rust's own HUD symbols for the vitals (health, calories, hydration) and Bleeding.
  extra:['source-ui-health','source-ui-food-cooked','source-ui-cup-water','source-ui-bleeding']},
 x360:{pack:'xbox360',mark:'xbox-sphere',
  icons:{chat:'messages',room:'player',setup:'controller',squad:'player',apps:'guide',success:'achievement'},
  states:{ready:'ring-of-light',listening:'ring-of-light'},
  // v2.30: the Blades dashboard's own 32 px icons where it showed them: achievements, friends, gamerscore.
  extra:['source-achievements','source-friends','source-gscore']},
 ipod:{mark:'apple-mark',
  icons:{sounds:'shuffle',setup:'click-wheel',voice:'earbuds'},
  states:{speaking:'earbuds'}},
 msn:{mark:'msn-butterfly',
  icons:{chat:'typing',room:'messenger-buddies',squad:'messenger-buddies'},
  states:{},
  // v2.30: the original 19 px emoticons in the Emoticons menu (only there, as in Messenger).
  extra:['source-smile','source-winking-smile-static','source-thumbs-up','source-thumbs-down','source-thinking-smile-static','source-nerd-smile',
   'source-light-bulb','source-note','source-star','source-telephone-receiver','source-sleeping-half-moon','source-be-right-back']},
 xmb:{pack:'ps3',mark:'playstation-mark',
  // v2.30: the XMB's own category icons for the category row: Friends (chat), Users (the room),
  // Music (sounds), Settings, Network (checks) and Game.
  icons:{chat:'source-category-friends',room:'source-category-users',squad:'source-category-users',sounds:'source-category-music',
   setup:'source-category-settings',advanced:'source-category-settings',checks:'source-category-network',games:'source-category-game',success:'trophy'},
  states:{}},
};
