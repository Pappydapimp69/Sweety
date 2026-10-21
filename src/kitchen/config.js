// Every tuning number for the Kitchen (chapter 1: a co-op twin-stick shooter). Tiles and seconds.
export const DT = 1 / 60;
export const R = 0.35;            // a player's radius
export const WALK = 6.2;
export const ACCEL = 70;
export const HP = 3;
export const HURT_TIME = 1.0;     // invulnerable after a bite
export const DOWN_TIME = 2.5;     // knocked out: back at the checkpoint after this
export const FALL_TIME = 0.8;
export const ROLL_TIME = 0.22;    // the dodge roll (jump): fast, untouchable, clears one tile of gap
export const ROLL_V = 13;
export const ROLL_COOL = 0.5;

// Spice: the syrup gun. Sticks, slows, coats. Never hurts.
export const SYRUP_RATE = 0.13;   // seconds between blobs while held
export const SYRUP_V = 13;
export const SYRUP_RANGE = 6.5;
export const COAT_MAX = 3;
export const COAT_DECAY = 4;      // seconds per coat lost
export const PUDDLE_R = 0.85;
export const PUDDLE_LIFE = 12;
export const PUDDLE_MAX = 28;
// Sugar: the sparkler. Bounces off most things. Lights syrup.
export const SPARK_RATE = 0.25;
export const SPARK_V = 17;
export const SPARK_RANGE = 8;
export const SPARK_DMG = 1;       // on a bare ant; nothing on a shell, a nest or the queen
// what they make together: caramel
export const BLAST_R = 1.5;
export const BLAST_DMG = 3;       // plus BLAST_COAT per coat on whatever it hits
export const BLAST_COAT = 2;
export const CHAIN_DELAY = 0.09;  // a chain of blasts ripples, it doesn't pop all at once
export const BURN_TIME = 4;       // a lit puddle burns this long: light, and 1/s to ants in it
export const LAUNCH_DIST = 5.5;   // a lit puddle under you: a caramel jump the way you face
export const LAUNCH_TIME = 0.6;

export const ANT_V = 3.2;
export const ANT_HP = 3;
export const SOLDIER_V = 2.6;
export const SOLDIER_HP = 6;
export const NEST_HP = 9;
export const NEST_EVERY = 3.6;
export const NEST_NEAR = 15;
export const AGGRO = 11;          // ants come for you from this far

export const QUEEN_HP = 48;
export const QUEEN_DECAY = 2.2;   // she shakes a coat off this fast
export const SPIT_WARN = 1.0;
export const SPIT_R = 1.4;
export const CHARGE_WARN = 0.8;
export const CHARGE_V = 13;
export const STUN_TIME = 1.8;

export const SHOOTOUT_TIME = 20;
