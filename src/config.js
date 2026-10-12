// Every tuning number. World units are tiles; time is seconds.

export const DT = 1 / 60;          // fixed sim step
export const MAX_STEPS = 5;        // catch-up cap per frame (no spiral of death)

export const GRAVITY = 60;
export const MAX_FALL = 24;        // < 1 tile per step: no tunnelling
export const RUN = 8;
export const ACCEL_GROUND = 70;
export const ACCEL_AIR = 40;
export const JUMP_V = 20;          // peak ~3.33 tiles: 3-high walls solo, 4 needs a stack
export const JUMP_CUT = 0.45;      // release jump early -> shorter hop
export const COYOTE = 0.1;
export const JUMP_BUFFER = 0.12;

export const SIZE = {
  normal: { w: 0.75, h: 1.25 },
  small: { w: 0.5, h: 0.6 },
  big: { w: 1.3, h: 1.9 },
};
export const BIG_JUMP_V = 16;      // big Spice is heavy: ~2.1 tiles

export const SLAM_V = 26;          // Spice's slam
export const LAUNCH_V = 30;        // a launch pad fired by a slam: ~7.5 tiles
export const LAUNCH_REACH = 8;     // pads within this many tiles of the slam fire

export const PIN_SPEED = 30;
export const PIN_RANGE = 12;
export const PIN_MAX = 2;

export const LIGHT_R = 3.5;
export const LIGHT_R_BRIGHT = 6;

export const RESPAWN = 1.0;
export const LEASH_X = 22;         // max horizontal gap between the two

export const BONK_WIN = 5;
export const BONK_MIN_VY = 3;      // falling at least this fast to count
export const BONK_STUN = 0.6;

export const PAD_DEADZONE = 0.3;   // radial, not per axis
export const PAD_POLL_MS = 1000 / 120;

// ---- chapter 4+ powers
export const SWAP_COOLDOWN = 0.6;
export const GUST_LEN = 7;          // tiles in front of Sugar
export const GUST_H = 5;            // tall box centred on her
export const GUST_PUSH = 15;        // horizontal shove
export const GUST_LIFT = 9;         // and a little lift
export const GUST_TIME = 0.35;      // how long the shove overrides steering
export const GUST_COOLDOWN = 0.45;
export const GLIDE_FALL = 2.2;      // max fall speed while gliding
export const VENT_LIFT = 95;        // upward accel in a vent while gliding
export const VENT_MAX = 10;
export const VENT_REACH = 12;       // vent column height
export const DASH_V = 24;
export const DASH_TIME = 0.17;      // ~4 tiles
export const PINWHEEL_SPIN = 2.5;   // seconds a gusted pinwheel keeps its door open

// ---- gentle mode
export const GENTLE_RESPAWN = 0.35;

// ---- mini-games
export const RAIN_TIME = 45;
export const RAIN_EVERY = 0.55;
export const POTATO_ROUNDS = 3;     // first to this many wins
export const POTATO_MIN = 9;
export const POTATO_MAX = 16;
export const POTATO_PASS_COOLDOWN = 0.6;
