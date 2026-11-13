import { area, closestPoint, distance, wallEdges, EPS, inside, onSegment, partitionRegion, rayDistance, segmentDistance, same, simplify, type Point, type Polygon } from './geometry';
import { SHORE_CONTACT_TOLERANCE, turnAtJunction, walkCoast } from './coast';
import { OPENING_HZ, OPENING_SECONDS, openingRectangle, openingSpawn, openingTouchesFace, type Opening, type OpeningFace } from './opening';
import { Island } from './island';
import { snapDrawing } from './snapping';
import { POWER_UP_DURATION, POWER_UP_KINDS, powerUpPosition, type PowerUp, type PowerUpKind } from './powerups';
import { advanceEnemy, createEnemy, defaultBoss, defaultEnemies, DEFEAT_POINTS, enemyHitRadius, type DefeatedEnemy, type Enemy, type EnemyMotion } from './enemies';
import { LINE_SPEED_BOOST, measureCompletion, type CompletionMask, type CompletionReading } from './completion';
import { EightWayAttack, MAX_HAZARDS, type AttackHazard, type BossAttack, type BossAttackFactory } from './attacks';
import { BOSS_HIT_POINTS, MAX_ENEMIES, findLanding, jumpPose, safeLanding, type BossConfig, type BossJump, type BossHitVisual, type ReinforcementRule, type VictoryConfig } from './boss';
export type { Point } from './geometry';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Phase = 'ready' | 'opening' | 'playing' | 'paused' | 'won' | 'lost';
export type GameEvent = 'start' | 'capture' | 'hit' | 'won' | 'lost' | 'partition' | 'bossAttack' | 'characterComplete' | { type: 'defeat'; enemies: DefeatedEnemy[] } | { type: 'bossHit'; hit: BossHitVisual } | { type: 'powerup'; kind: PowerUpKind };
export interface GameOptions { opening?: boolean; openingFace?: OpeningFace; enemies?: Enemy[]; boss?: Enemy | null; createBossAttack?: BossAttackFactory; bossConfig?: BossConfig; victory?: VictoryConfig; random?: () => number; squad?: Partial<Record<'straight' | 'orbit' | 'zigzag', number>>; speedScale?: number; bossSpeedScale?: number; enemyMotion?: EnemyMotion; powerUps?: boolean }
const vectors: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
export const PLAYER_SPEED = 22.222222;
export const RETRACT_SPEED = PLAYER_SPEED * 3;
const PLAYER_RADIUS = 0.34;

export class Game {
  readonly target: number;
  readonly bossMaxHealth: number;
  bossHealth: number;
  bossJump: BossJump | undefined;
  bossFlash = 0;
  bossPhase = '默认';
  winReason: 'territory' | 'boss' | undefined;
  private bossDefeated = false;
  private bossStageIndex = -1;
  private reinforcementRule: ReinforcementRule | undefined;
  private reinforcementClock = 0;
  private reinforcementSerial = 0;
  private readonly bossSettings: Required<BossConfig>;
  private readonly bossVictory: boolean;
  private readonly territoryVictory: boolean;
  private readonly random: () => number;
  readonly outline: Polygon;
  territories: Polygon[];
  private cutRegion = -1;
  private island: Island | undefined;
  private boundaryRelocated = false;
  private playerPath: Point[] = [];
  private shoreStep: { direction: Direction; point: Point } | undefined;
  private backtrackEnded = false;
  private resumePhase: 'playing' | 'opening' = 'playing';
  opening: Opening | undefined;
  actorsReady = false;
  lastCapture: Polygon[] = [];
  lastDefeats: DefeatedEnemy[] = [];
  captured: Polygon[] = [];
  player: Point;
  anchor: Point;
  enemies: Enemy[] = [];
  boss: Enemy | undefined;
  bossAttack: BossAttack | undefined;
  hazards: AttackHazard[] = [];
  trail: Polygon = [];
  retracting = false;
  // A self-touch rewind keeps running after the line is gone until a new draw
  // press. The press that was already held does not count.
  private trailRewind = false;
  private drawingHeld = false;
  phase: Phase = 'ready';
  lives = 3;
  hitsTaken = 0;
  readonly maxLives = 3;
  /** Extra points from the latest capture when it covered more than 5% of the board. */
  lastCaptureBonus = 0;
  /** True when that capture also restored one life. */
  lastCaptureHeal = false;
  /** The revealed character covers at least 95% of its mask. */
  characterComplete = false;
  private completionMask?: CompletionMask;
  private completion?: CompletionReading;
  score = 0;
  elapsed = 0;
  powerUp: PowerUp | undefined;
  readonly powerUpEffects: Record<PowerUpKind, number> = { slow: 0, stop: 0, speed: 0 };
  private powerUpWait = 0;
  protection = 0;
  events: GameEvent[] = [];

  constructor(readonly width = 72, readonly height = 48, private readonly options: GameOptions = {}) {
    this.target = options.victory?.territoryPercent ?? 75;
    this.bossMaxHealth = options.bossConfig?.maxHealth ?? 5; this.bossHealth = this.bossMaxHealth;
    this.bossSettings = { maxHealth: this.bossMaxHealth, jumpDuration: options.bossConfig?.jumpDuration ?? 0.9, phases: options.bossConfig?.phases ?? [] };
    this.bossVictory = options.victory?.defeatBoss ?? true; this.territoryVictory = options.victory?.territory ?? true;
    if (!this.bossVictory && !this.territoryVictory) throw new Error('At least one victory route is required'); this.random = options.random ?? Math.random;
    if (!Number.isInteger(this.bossMaxHealth) || this.bossMaxHealth < 1 || !Number.isFinite(this.bossSettings.jumpDuration) || this.bossSettings.jumpDuration <= 0
      || !Number.isFinite(this.target) || this.target <= 0 || this.target > 100) throw new Error('Invalid boss or victory configuration');
    for (const phase of this.bossSettings.phases) {
      if (!phase.id || (phase.when.healthAtMost === undefined && phase.when.territoryAtLeast === undefined)
        || (phase.when.healthAtMost !== undefined && (!Number.isFinite(phase.when.healthAtMost) || phase.when.healthAtMost < 0 || phase.when.healthAtMost > this.bossMaxHealth))
        || (phase.when.territoryAtLeast !== undefined && (!Number.isFinite(phase.when.territoryAtLeast) || phase.when.territoryAtLeast < 0 || phase.when.territoryAtLeast > 100))) throw new Error('Invalid boss phase');
      const rule = phase.reinforcements;
      if (rule && (!Number.isInteger(rule.targetCount) || rule.targetCount < 0 || rule.targetCount > MAX_ENEMIES
        || !Number.isFinite(rule.interval) || rule.interval <= 0 || !Number.isFinite(rule.speed) || rule.speed <= 0
        || (rule.batchSize !== undefined && (!Number.isInteger(rule.batchSize) || rule.batchSize < 1 || rule.batchSize > MAX_ENEMIES))
        || (rule.motion !== undefined && !['vertical', 'axes'].includes(rule.motion)))) throw new Error('Invalid reinforcement rule');
    }
    if (width < 6 || height < 6) throw new Error('Board must be at least 6 × 6');
    this.outline = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    this.territories = [this.outline.map(p => ({ ...p }))];
    this.player = { x: width / 2, y: 0 };
    this.anchor = { ...this.player };
    if (options.boss === null && !this.territoryVictory) throw new Error('Boss-only victory needs a boss');
    if (!(options.opening ?? false)) this.spawnActors();
  }
  private spawnActors() {
    this.actorsReady = true;
    const options = this.options;
    this.boss = options.boss === null ? undefined : options.boss ?? defaultBoss(this.width, this.height);
    this.enemies = options.enemies ?? defaultEnemies(this.width, this.height, this.boss, this.random, this.opening ? { regions: this.territories, player: this.player } : undefined, options.squad);
    if (options.speedScale && options.speedScale !== 1) for (const enemy of this.enemies) { enemy.vx *= options.speedScale; enemy.vy *= options.speedScale; }
    if (options.enemyMotion) for (const enemy of this.enemies) {
      enemy.motionClock = this.random() * options.enemyMotion.period;
      enemy.turnClock %= options.enemyMotion.zigzagInterval;
    }
    if (options.bossSpeedScale && options.bossSpeedScale !== 1 && this.boss) { this.boss.vx *= options.bossSpeedScale; this.boss.vy *= options.bossSpeedScale; }
    this.bossAttack = this.boss ? (options.createBossAttack ?? (() => new EightWayAttack()))() : undefined;
    this.advanceBossPhase();
  }
  get claimed() { return this.width * this.height - this.territories.reduce((sum, polygon) => sum + area(polygon), 0); }
  get percent() { return this.completion?.percent ?? this.claimed / (this.width * this.height) * 100; }
  get lineSpeed() { return PLAYER_SPEED * (this.characterComplete ? LINE_SPEED_BOOST : 1) * (this.powerUpEffects.speed > 0 ? 1.5 : 1); }
  setOpeningFace(face: GameOptions['openingFace']) {
    this.options.openingFace = face;
    if (this.opening && (this.phase === 'opening' || this.phase === 'paused' && this.resumePhase === 'opening')
      && face && openingTouchesFace(this.opening.region, this.width, this.height, face)) {
      this.opening.region = openingRectangle(this.width, this.height, this.random, this.options.boss ?? undefined, face);
    }
  }
  setCompletionMask(mask: CompletionMask | undefined) {
    this.completionMask = mask;
    this.recomputeCompletion();
  }
  recomputeCompletion() {
    const was = this.characterComplete;
    if (!this.completionMask) { this.completion = undefined; this.characterComplete = false; return; }
    this.completion = measureCompletion(this.completionMask, this.width, this.height, this.territories);
    this.characterComplete = this.completion.characterComplete;
    if (!was && this.characterComplete && this.phase === 'playing') this.events.push('characterComplete');
  }
  get reinforcementTarget() { return this.reinforcementRule?.targetCount; }
  // Rendering and walking use the same current perimeter. The immutable arena
  // outline still defines size/score but never keeps an already claimed edge alive.
  get boundarySegments() { return this.island ? this.island.coast : this.options.opening ? [] : this.territories.flatMap(wallEdges); }
  isBoundary(x: number, y: number) {
    return this.boundarySegments.some(([a, b]) => onSegment({ x, y }, a, b));
  }
  start() {
    if (this.phase !== 'ready') return;
    if (this.options.opening) {
      const region = openingRectangle(this.width, this.height, this.random, this.options.boss ?? undefined, this.options.openingFace);
      this.opening = { region, elapsed: 0, nextAt: 1 / OPENING_HZ, candidates: 1 }; this.phase = 'opening'; return;
    }
    this.phase = 'playing'; this.events.push('start'); if (this.options.powerUps) this.spawnPowerUp();
  }
  confirmOpening() {
    if (this.phase !== 'opening' || !this.opening) return false;
    const region = this.opening.region;
    if (this.options.openingFace && openingTouchesFace(region, this.width, this.height, this.options.openingFace)) return false;
    this.island = new Island(this.outline, region); this.territories = this.island.regions; this.captured = [region, ...this.island.sealedGaps];
    this.player = openingSpawn(region, this.random); this.anchor = { ...this.player };
    this.phase = 'playing'; this.spawnActors(); this.events.push('start'); this.recomputeCompletion(); this.checkWin();
    if (this.options.powerUps && this.phase === 'playing') this.spawnPowerUp();
    return true;
  }
  private spawnPowerUp() {
    if (!this.options.powerUps || this.powerUp) return;
    const bodies = this.boss && !this.bossJump ? [...this.enemies, this.boss] : this.enemies;
    const point = powerUpPosition(this.width, this.height, this.territories, this.player, bodies, this.trail, this.random);
    if (!point) { this.powerUpWait = 0.5; return; }
    const index = Math.min(POWER_UP_KINDS.length - 1, Math.floor(this.random() * POWER_UP_KINDS.length));
    this.powerUp = { ...point, kind: POWER_UP_KINDS[index] };
  }
  private collectPowerUp() {
    if (!this.powerUp) return;
    const kind = this.powerUp.kind;
    this.powerUp = undefined;
    this.powerUpEffects[kind] = POWER_UP_DURATION[kind];
    // Leave a small margin for the next physics/render frame so the visible
    // spawn remains strictly under 20 seconds after pickup.
    this.powerUpWait = 10 + Math.min(1 - Number.EPSILON, Math.max(0, this.random())) * 9.9;
    this.events.push({ type: 'powerup', kind });
  }
  private keepPowerUpInWater() {
    const item = this.powerUp;
    if (!item || this.territories.some(region => inside(item, region))) return;
    // If the cut runs exactly through an item, merely touching it must not
    // collect it. Shift it imperceptibly into remaining water so a later cut
    // can still enclose it, including at corners and the arena frame.
    for (const gap of [1e-4, 1e-3, 1e-2, 0.1]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const point = { x: item.x + dx * gap, y: item.y + dy * gap };
      if (this.territories.some(region => inside(point, region))) { Object.assign(item, point); return; }
    }
    const bodies = this.boss && !this.bossJump ? [...this.enemies, this.boss] : this.enemies;
    const point = powerUpPosition(this.width, this.height, this.territories, this.player, bodies, this.trail, this.random);
    if (point) Object.assign(item, point);
  }
  togglePause() {
    if (this.phase === 'playing' || this.phase === 'opening') { this.resumePhase = this.phase; this.phase = 'paused'; }
    else if (this.phase === 'paused') this.phase = this.resumePhase;
  }
  // Distance is continuous world-space distance, never a cell count.
  move(direction: Direction, drawing: boolean, amount: number) {
    this.backtrackEnded = false;
    this.playerPath = [{ ...this.player }];
    if (this.phase !== 'playing' || this.retracting || this.trailRewind || !Number.isFinite(amount) || amount <= EPS) return false;
    const previousStep = this.shoreStep; this.shoreStep = undefined;
    const v = vectors[direction]; let p = this.player;
    if (this.trail.length && !drawing) return false;
    if (!this.trail.length) {
      const shore = this.island ? this.island.project(p, SHORE_CONTACT_TOLERANCE) : this.isBoundary(p.x, p.y) ? p : undefined;
      if (!shore) return false;
      p = this.player = shore; this.playerPath.push({ ...p });
      const continuingStep = previousStep?.direction === direction && same(previousStep.point, this.playerPath[0]);
      const route = walkCoast(p, v, amount, this.boundarySegments, continuingStep);
      if (route.length > 1) {
        this.playerPath.push(...route.slice(1)); this.player = route.at(-1)!;
        if (route.stepping) this.shoreStep = { direction, point: { ...this.player } };
        return false;
      }
      const entry = { x: p.x + v.x * 1e-5, y: p.y + v.y * 1e-5 };
      if (this.island) {
        if (entry.x < 0 || entry.x > this.width || entry.y < 0 || entry.y > this.height) return false;
        // A tangent departure from a true shore may run along the arena limit.
        // Probe just inside the arena to find its water region; this does not
        // make bare frame walkable or move the player's actual line inward.
        entry.x = Math.max(1e-5, Math.min(this.width - 1e-5, entry.x));
        entry.y = Math.max(1e-5, Math.min(this.height - 1e-5, entry.y));
      }
      const region = this.territories.findIndex(region => inside(entry, region));
      if (region < 0) {
        const turn = turnAtJunction(p, v, amount, this.boundarySegments);
        this.playerPath.push(...turn.slice(1)); this.player = turn.at(-1)!;
        if (turn.stepping) this.shoreStep = { direction, point: { ...this.player } };
        return false;
      }
      if (!drawing || this.protection > 0) return false;
      this.cutRegion = region;
      this.anchor = { ...p };
      this.trail = [{ ...p }];
    }
    const last = this.trail.at(-1)!;
    const previous = same(last, p) && this.trail.length > 1 ? this.trail.at(-2)! : last;
    // Reverse input erases the current segment at normal walking speed. At a
    // bend, update carries the remaining distance into the held direction.
    if ((p.x - previous.x) * v.x + (p.y - previous.y) * v.y < -EPS) {
      if (this.collidesWithTrail() || this.hazardsHit(p, p)) { this.hit(); return false; }
      const segmentLength = Math.hypot(p.x - previous.x, p.y - previous.y);
      const travel = Math.min(amount, segmentLength), returned = this.retract(travel);
      if (this.collidesWithTrail() || this.hazardsHit(p, this.player)) { this.hit(); return false; }
      this.backtrackEnded = returned || travel >= segmentLength - EPS;
      return false;
    }
    let wall = Infinity;
    for (const [a, b] of (this.island ? this.boundarySegments : wallEdges(this.territories[this.cutRegion]))) wall = Math.min(wall, rayDistance(p, v, a, b));
    const arenaReach = v.x > 0 ? this.width - p.x : v.x < 0 ? p.x : v.y > 0 ? this.height - p.y : p.y;
    const travel = Math.min(amount, wall, Math.max(0, arenaReach));
    const route = this.island ? snapDrawing(p, v, amount, this.boundarySegments, arenaReach) : {
      points: [{ x: Math.max(0, Math.min(this.width, p.x + v.x * travel)), y: Math.max(0, Math.min(this.height, p.y + v.y * travel)) }],
      closes: wall <= travel + EPS,
    };
    // Sweep every leg of a magnetic corner correction, just like normal line
    // movement. Snapping must neither skip hazards nor cut through a live line.
    let moved = false;
    for (const target of route.points) {
      const next = this.island ? this.island.project(target) ?? target : target;
      const step = Math.hypot(next.x - p.x, next.y - p.y);
      if (step <= EPS) continue;
      const axis = { x: (next.x - p.x) / step, y: (next.y - p.y) / step };
      // Returning to the departure shore is a closure, not a self-touch bounce.
      for (let i = 0; i < this.trail.length - 1; i++) {
        const a = this.trail[i], b = this.trail[i + 1];
        if (onSegment(p, a, b)) continue;
        if (rayDistance(p, axis, a, b) <= step + EPS
          && !(this.island && i === 0 && same(next, this.anchor) && !onSegment(b, p, next))) {
          this.rewindAlongTrail();
          return false;
        }
      }
      this.trail = simplify([...this.trail, next]);
      this.player = next; this.playerPath.push({ ...next }); moved = true;
      if (this.collidesWithTrail() || this.hazardsHit(p, next)) { this.hit(); return false; }
      p = next;
    }
    if (moved && route.closes) { this.capture(); return true; }
    return false;
  }
  beginRetraction() {
    this.drawingHeld = false;
    this.startRetraction();
  }
  resumeDrawing() {
    if (this.phase !== 'playing') return;
    this.drawingHeld = true; this.retracting = false; this.trailRewind = false;
  }
  private rewindAlongTrail() {
    // Keep drawingHeld set so the key or finger that is already down does not
    // immediately cancel. Releasing and pressing again calls resumeDrawing.
    this.drawingHeld = true; this.trailRewind = true; this.startRetraction();
  }
  private startRetraction() {
    if (this.phase === 'playing' && this.trail.length > 1) this.retracting = true;
  }
  private retract(amount: number) {
    // Consume distance from the tip backwards, preserving every original corner.
    while (this.trail.length > 1 && amount > EPS) {
      const tip = this.trail.at(-1)!, previous = this.trail.at(-2)!;
      const length = Math.hypot(tip.x - previous.x, tip.y - previous.y);
      if (amount >= length - EPS) {
        amount = Math.max(0, amount - length);
        this.trail.pop(); this.player = { ...previous };
      } else {
        this.player = { x: tip.x + (previous.x - tip.x) * amount / length, y: tip.y + (previous.y - tip.y) * amount / length };
        this.trail[this.trail.length - 1] = { ...this.player };
        amount = 0;
      }
      this.playerPath.push({ ...this.player });
    }
    if (this.trail.length > 1) return false;
    this.trail = []; this.cutRegion = -1; this.retracting = false; this.player = { ...this.anchor };
    return true;
  }
  private capture() {
    this.shoreStep = undefined;
    let bossEnclosed = false;
    let remaining: Polygon[] = [];
    if (this.island) {
      let captured: Polygon[] | undefined;
      try { captured = this.island.close(this.trail, this.territories[this.cutRegion]); } catch { /* Keep the path recoverable if a degenerate loop cannot be resolved. */ }
      if (!captured) {
        // A failed geometric closure must still recover while the same press is
        // held. Only a fresh press may interrupt that recovery.
        this.rewindAlongTrail(); return;
      }
      this.lastCapture = captured; this.territories = this.island.regions;
      bossEnclosed = Boolean(this.boss && captured.some(region => inside(this.boss!, region)));
    } else {
      const parts = partitionRegion(this.territories[this.cutRegion], this.trail);
      if (parts.length === 1) {
        this.territories.splice(this.cutRegion, 1, parts[0]);
        this.score += Math.round(this.trail.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - this.trail[i].x, p.y - this.trail[i].y), 0) * 5);
        this.cutRegion = -1; this.trail = []; this.anchor = { ...this.player };
        this.lastCapture = []; this.lastDefeats = []; this.lastCaptureBonus = 0; this.lastCaptureHeal = false; this.events.push('partition'); return;
      }
      const bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
      const occupants = parts.map(part => bodies.filter(body => inside(body, part)));
      const difference = area(parts[0]) - area(parts[1]);
      // An explicit return loop owns its interior, even when that is the larger
      // face. Through-cuts retain the existing smaller-side/equal-split rule;
      // an empty exterior never expands an explicit loop beyond what was drawn.
      const pocket = parts.enclosed ?? (Math.abs(difference) <= EPS ? -1 : difference < 0 ? 0 : 1);
      bossEnclosed = Boolean(this.boss && pocket >= 0 && inside(this.boss, parts[pocket as 0 | 1]));
      const keepRoomForLanding = bossEnclosed && (this.bossJump || this.bossHealth > 1);
      this.lastCapture = parts.filter((_, i) => i === pocket || (parts.enclosed === undefined && !keepRoomForLanding && !occupants[i].length));
      remaining = parts.filter(part => !this.lastCapture.includes(part));
    }
    const defeated = new Set(this.enemies.filter(body => this.lastCapture.some(part => inside(body, part))));
    this.lastDefeats = [...defeated].map(body => ({ kind: body.kind, x: body.x, y: body.y, points: DEFEAT_POINTS[body.kind] }));
    this.enemies = this.enemies.filter(enemy => !defeated.has(enemy));
    const length = this.trail.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - this.trail[i].x, p.y - this.trail[i].y), 0);
    if (!this.island) this.territories.splice(this.cutRegion, 1, ...remaining);
    this.cutRegion = -1;
    this.captured.push(...this.lastCapture, ...this.island?.sealedGaps ?? []);
    // A pickup enclosed by a successful capture remains obtainable even when
    // the water underneath it becomes land.
    if (this.powerUp && [...this.lastCapture, ...this.island?.sealedGaps ?? []].some(region => inside(this.powerUp!, region))) this.collectPowerUp();
    else this.keepPowerUpInWater();
    this.trail = [];
    if (!this.isBoundary(this.player.x, this.player.y)) {
      // Finishing an entire disconnected room can erase the closure point too.
      // Reconnect to the nearest surviving perimeter instead of stranding the
      // player or allowing invisible travel through the finished room.
      const candidates = this.boundarySegments.map(([a, b]) => closestPoint(this.player, a, b));
      const nearest = candidates.sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0];
      if (nearest) { this.player = nearest; this.boundaryRelocated = true; }
    }
    this.anchor = { ...this.player };
    const claimed = this.lastCapture.reduce((sum, region) => sum + area(region), 0);
    const territoryScore = Math.round(claimed * 10 + length * 5);
    const share = claimed / (this.width * this.height) * 100;
    // The area score is paid in full first. A single loop over 5% of the board
    // adds half of that score again; over 10% it adds the whole score again and,
    // when a life is missing, restores one life up to the run's maximum.
    this.lastCaptureBonus = share > 10 ? territoryScore : share > 5 ? Math.round(territoryScore * 0.5) : 0;
    this.lastCaptureHeal = false;
    if (share > 10 && this.lives < this.maxLives) { this.lives += 1; this.lastCaptureHeal = true; }
    this.score += territoryScore + this.lastDefeats.reduce((sum, enemy) => sum + enemy.points, 0) + this.lastCaptureBonus;
    this.events.push(claimed > EPS ? 'capture' : 'partition');
    if (bossEnclosed && this.boss) {
      const from = this.bossJump ? jumpPose(this.bossJump) : { ...this.boss };
      if (!this.bossJump) {
        this.bossHealth--; this.score += BOSS_HIT_POINTS; this.bossFlash = 0.3;
        this.events.push({ type: 'bossHit', hit: { x: this.boss.x, y: this.boss.y, points: BOSS_HIT_POINTS, health: this.bossHealth, maxHealth: this.bossMaxHealth } });
      }
      if (this.bossHealth <= 0) {
        const defeat = { kind: this.boss.kind, x: this.boss.x, y: this.boss.y, points: DEFEAT_POINTS.boss };
        this.lastDefeats.push(defeat); this.score += defeat.points;
        this.boss = undefined; this.bossAttack = undefined; this.bossJump = undefined; this.bossDefeated = true;
      } else this.startBossJump(from);
    }
    if (this.lastDefeats.length) this.events.push({ type: 'defeat', enemies: this.lastDefeats });
    this.recomputeCompletion(); this.advanceBossPhase(); this.checkWin();
  }
  private checkWin() {
    if (this.phase !== 'playing') return;
    if (this.bossVictory && this.bossDefeated) this.winReason = 'boss';
    else if (this.territoryVictory && this.percent >= this.target - EPS) this.winReason = 'territory';
    if (this.winReason) { this.phase = 'won'; this.score += this.lives * 1000; this.events.push('won'); this.hazards = []; this.bossJump = undefined; }
  }
  private advanceBossPhase() {
    if (!this.boss) return;
    for (let i = this.bossStageIndex + 1; i < this.bossSettings.phases.length; i++) {
      const phase = this.bossSettings.phases[i];
      if ((phase.when.healthAtMost === undefined || this.bossHealth <= phase.when.healthAtMost)
        && (phase.when.territoryAtLeast === undefined || this.percent >= phase.when.territoryAtLeast)) {
        this.bossStageIndex = i; this.bossPhase = phase.id;
        if (phase.createAttack) this.bossAttack = phase.createAttack();
        this.reinforcementRule = phase.reinforcements; this.reinforcementClock = 0;
      }
    }
  }
  private updateReinforcements(seconds: number) {
    const rule = this.reinforcementRule;
    if (!rule || !this.boss || this.bossJump) return false;
    this.reinforcementClock += seconds;
    if (this.reinforcementClock < rule.interval - EPS) return false;
    this.reinforcementClock = Math.max(0, this.reinforcementClock - rule.interval);
    const target = Math.min(rule.targetCount, this.enemies.length + (rule.batchSize ?? MAX_ENEMIES));
    let spawned = false;
    while (this.enemies.length < target) {
      const horizontal = rule.motion === 'axes' && this.reinforcementSerial % 2 === 0;
      const speed = (this.random() < 0.5 ? -1 : 1) * rule.speed;
      const enemy = createEnemy('straight', { x: 0, y: 0 }, { x: horizontal ? speed : 0, y: horizontal ? 0 : speed });
      const to = findLanding(this.territories, enemy, [...this.enemies, this.boss], this.player, this.trail, this.random);
      // A crowded/narrow room defers the remaining reinforcements; never force
      // a body onto an active line, the player, another body or claimed land.
      if (!to) break;
      if (this.options.enemyMotion) enemy.motionClock = this.random() * this.options.enemyMotion.period;
      enemy.x = to.x; enemy.y = to.y; enemy.previous = { ...to }; enemy.trace = [{ ...to }];
      this.enemies.push(enemy); this.reinforcementSerial++; spawned = true;
    }
    return spawned;
  }
  private startBossJump(from: Point) {
    if (!this.boss) return;
    const to = findLanding(this.territories, this.boss, this.enemies, this.player, [], this.random);
    const duration = this.bossJump ? Math.max(0.2, this.bossJump.duration - this.bossJump.elapsed) : this.bossSettings.jumpDuration;
    this.bossJump = { from: { x: from.x, y: from.y }, to, elapsed: 0, duration };
    if (to) { this.boss.x = to.x; this.boss.y = to.y; this.boss.previous = { ...to }; }
    this.boss.trace = []; this.boss.traceClock = 0;
  }
  private updateBossJump(seconds: number) {
    const jump = this.bossJump, boss = this.boss;
    if (!jump || !boss) return;
    jump.elapsed += seconds;
    if (jump.elapsed < jump.duration) return;
    if (!jump.to && jump.retryIn && jump.retryIn > 0) { jump.retryIn -= seconds; return; }
    if (jump.to && safeLanding(jump.to, this.territories, boss, this.enemies, this.player, this.trail)) {
      boss.x = jump.to.x; boss.y = jump.to.y; boss.previous = { ...jump.to }; this.bossJump = undefined;
    } else {
      const landing = findLanding(this.territories, boss, this.enemies, this.player, this.trail, this.random);
      if (landing) {
        const from = jumpPose(jump); this.bossJump = { from, to: landing, elapsed: 0, duration: 0.35 };
        boss.x = landing.x; boss.y = landing.y; boss.previous = { ...landing };
      } else { jump.to = null; jump.elapsed = jump.duration; jump.retryIn = 0.25; }
    }
  }
  private collidesWithTrail(swept = false) {
    const bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
    return !this.protection && bodies.filter(body => body !== this.boss || !this.bossJump).some(body => this.trail.slice(1).some((p, i) => (swept ? segmentDistance(body.previous, body, this.trail[i], p) : distance(body, this.trail[i], p)) <= enemyHitRadius(body) + 0.12));
  }
  private hit() {
    // The live stroke starts at trail[0]. Anchor can still be an older shore
    // point until that stroke is created, so a death uses the stroke itself.
    const home = this.trail.length ? { ...this.trail[0] } : { ...this.anchor };
    this.shoreStep = undefined;
    this.trail = []; this.cutRegion = -1; this.retracting = false; this.trailRewind = false;
    this.player = home; this.anchor = { ...home }; this.lives--; this.hitsTaken++; this.protection = 1.5;
    this.events.push('hit');
    if (!this.lives) { this.phase = 'lost'; this.events.push('lost'); this.hazards = []; this.bossJump = undefined; }
  }
  spawnHazard(hazard: AttackHazard) {
    if (this.hazards.length >= MAX_HAZARDS || hazard.expired) return false;
    this.hazards.push(hazard); return true;
  }
  private hazardsHit(from: Point, to: Point) {
    if (this.protection > 0) return false;
    const hits = this.hazards.filter(hazard => hazard.hitsPlayer(from, to, PLAYER_RADIUS) || hazard.hitsTrail(this.trail, 0.12));
    for (const hazard of hits) hazard.onHit();
    return hits.length > 0;
  }
  update(seconds: number, direction?: Direction, drawing = false) {
    if (this.phase === 'opening' && this.opening && Number.isFinite(seconds) && seconds > 0) {
      const next = Math.min(OPENING_SECONDS, this.opening.elapsed + seconds);
      while (this.opening.nextAt <= next + EPS && this.opening.nextAt < OPENING_SECONDS - EPS) {
        this.opening.region = openingRectangle(this.width, this.height, this.random, this.options.boss ?? undefined, this.options.openingFace);
        this.opening.nextAt += 1 / OPENING_HZ; this.opening.candidates++;
      }
      this.opening.elapsed = next;
      if (next >= OPENING_SECONDS - EPS) { this.confirmOpening(); return true; }
      return false;
    }
    if (this.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return false;
    if (drawing && !this.drawingHeld) this.resumeDrawing();
    if (!drawing) this.beginRetraction();
    let bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
    const pace = this.options.enemyMotion?.straight === 'surge' ? 1.7 : 1;
    const maxSpeed = Math.max(RETRACT_SPEED * (this.options.powerUps ? 1.5 : 1), ...bodies.map(body => Math.hypot(body.vx, body.vy) * pace), ...this.bossSettings.phases.map(phase => (phase.reinforcements?.speed ?? 0) * pace));
    const steps = Math.max(1, Math.ceil(seconds * maxSpeed / 0.12));
    const dt = seconds / steps;
    let gestureEnded = false;
    let walls = this.territories.map(wallEdges);
    for (let i = 0; i < steps && this.phase === 'playing'; i++) {
      const itemAtStart = this.powerUp;
      // Integrate partial expiry within the substep so durations and speeds
      // stay consistent across frame rates and overlapping effects.
      const stopped = Math.min(dt, this.powerUpEffects.stop);
      const active = dt - stopped;
      const slowed = Math.max(0, Math.min(dt, this.powerUpEffects.slow) - stopped);
      const enemyTime = active - slowed * 0.3;
      const playerTime = dt + Math.min(dt, this.powerUpEffects.speed) * 0.5;
      for (const kind of POWER_UP_KINDS) {
        const remaining = this.powerUpEffects[kind] - dt;
        this.powerUpEffects[kind] = remaining > EPS ? remaining : 0;
      }
      this.elapsed += dt; this.protection = Math.max(0, this.protection - dt); this.bossFlash = Math.max(0, this.bossFlash - dt);
      if (enemyTime > 0) this.updateBossJump(enemyTime);
      if (active > 0 && this.updateReinforcements(active)) bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
      for (const body of bodies) {
        if (enemyTime > 0 && (body !== this.boss || !this.bossJump)) advanceEnemy(body, enemyTime, this.territories, walls, body === this.boss ? undefined : this.options.enemyMotion);
        else body.previous = { x: body.x, y: body.y };
      }
      if (active > 0 && this.boss && this.bossAttack && !this.bossJump) this.bossAttack.update(active, {
        origin: this.boss, target: this.player, arena: this, spawn: hazard => this.spawnHazard(hazard), cast: () => this.events.push('bossAttack'),
      });
      // update(0) refreshes each projectile's previous position without moving
      // it, so frozen projectiles stay dangerous but do not replay an old sweep.
      for (const hazard of this.hazards) hazard.update(active, this);
      this.boundaryRelocated = false;
      const lives = this.lives, playerBefore = { ...this.player };
      const bodyHit = this.collidesWithTrail(true), attackHit = this.hazardsHit(playerBefore, playerBefore);
      if (bodyHit || attackHit) this.hit();
      if (lives !== this.lives) gestureEnded = true;
      if (!gestureEnded) {
        this.playerPath = [playerBefore];
        let boundaryChanged = false;
        if (this.retracting) {
          const finished = this.retract(RETRACT_SPEED * playerTime);
          // Back at the stroke's start. A direction still held while drawing
          // leaves immediately; the press that started the rewind does not
          // have to be repeated. Later substeps of this update perform it.
          const depart = finished && this.trailRewind && !!direction && drawing;
          if (finished && this.trailRewind) this.trailRewind = false;
          gestureEnded = finished && !depart;
        } else if (direction && !this.trailRewind) {
          let remaining = PLAYER_SPEED * (this.characterComplete ? LINE_SPEED_BOOST : 1) * playerTime;
          const route = [playerBefore];
          for (let pass = 0; pass < 8 && remaining > EPS; pass++) {
            const closed = this.move(direction, drawing, remaining);
            const travelled = this.playerPath.slice(1).reduce((sum, p, j) => sum + Math.hypot(p.x - this.playerPath[j].x, p.y - this.playerPath[j].y), 0);
            route.push(...this.playerPath.slice(1)); boundaryChanged ||= closed;
            // Closure and a fully erased segment keep the held direction and
            // unused travel budget. A full return to shore still ends reversal.
            gestureEnded = (this.backtrackEnded && !this.trail.length) || (closed && (this.boundaryRelocated || this.retracting || this.phase !== 'playing'));
            remaining = Math.max(0, remaining - travelled);
            if ((!closed && !this.backtrackEnded) || gestureEnded || travelled <= EPS) break;
          }
          this.playerPath = route;
        }
        const path = this.boundaryRelocated ? [this.player, this.player] : this.playerPath.length > 1 ? this.playerPath : [playerBefore, this.player];
        if (path.slice(1).some((p, i) => this.hazardsHit(path[i], p))) this.hit();
        if (lives !== this.lives) gestureEnded = true;
        if (boundaryChanged || gestureEnded) {
          walls = this.territories.map(wallEdges);
          bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
        }
      }
      if (this.options.powerUps && !itemAtStart && !this.powerUp) {
        this.powerUpWait -= dt;
        if (this.powerUpWait <= 0) this.spawnPowerUp();
      }
      this.hazards = this.hazards.filter(hazard => !hazard.expired);
    }
    return gestureEnded;
  }
}
