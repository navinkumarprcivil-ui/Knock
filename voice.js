/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Voice Assistant removed.
   This is a no-op stub so any remaining Voice.say(...) calls stay safe. */

const Voice = {
  enabled: false,
  init() {},
  set() {},
  say() {},
};

window.Voice = Voice;
