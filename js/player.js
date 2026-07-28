// ---------------------------------------------------------------------------
// player.js — the snowboarder: low-poly rider model, arcade carving physics,
// jumps, spins/grabs, crashes. update() returns a list of events for the
// game layer (score, sound, particles, UI).
// ---------------------------------------------------------------------------
'use strict';

const PHYS = {
  G: 13,               // gravity (arcade-tuned)
  STEER: 2.5,          // max steering rate, rad/s
  DRAG: 0.0028,        // aero drag coefficient
  FRICTION: 0.4,       // base snow friction decel
  CARVE_SCRUB: 0.045,  // speed lost to hard carving
  MAX_SPEED: 44,
  MIN_SPEED: 3,
  SPIN_RATE: 7.5,      // max trick spin, rad/s
};

class Player {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this._buildModel();
    scene.add(this.root);

    this.pos = new THREE.Vector3();
    this._n = new THREE.Vector3(0, 1, 0);        // terrain normal scratch
    this._smoothN = new THREE.Vector3(0, 1, 0);  // smoothed normal for the model
    this._qAlign = new THREE.Quaternion();
    this._qYaw = new THREE.Quaternion();
    this._qTmp = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._zAxis = new THREE.Vector3(0, 0, 1);
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this.reset();
  }

  // --- model ---------------------------------------------------------------

  _mesh(geo, color, parent, x, y, z) {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  _buildModel() {
    const JACKET = 0x2fb3a8, PANTS = 0x33415e, SKIN = 0xe8b08a,
          BEANIE = 0xd84f2f, BOARD = 0xf2c14e, BOOT = 0x22262e;

    // board (long axis = local z, forward = -z)
    const boardG = new THREE.Group();
    this._mesh(new THREE.BoxGeometry(0.34, 0.07, 1.5), BOARD, boardG, 0, 0.035, 0);
    this._mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 12), BOARD, boardG, 0, 0.035, 0.75);
    this._mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 12), BOARD, boardG, 0, 0.035, -0.75);
    this._mesh(new THREE.BoxGeometry(0.36, 0.015, 0.3), 0x2b2f38, boardG, 0, 0.075, 0);

    // rider (faces +x, riding with the left side downhill)
    const riderG = new THREE.Group();
    this.legF = this._mesh(new THREE.CapsuleGeometry(0.09, 0.35, 4, 8), PANTS, riderG, 0, 0.35, -0.3);
    this.legB = this._mesh(new THREE.CapsuleGeometry(0.09, 0.35, 4, 8), PANTS, riderG, 0, 0.35, 0.3);
    this._mesh(new THREE.BoxGeometry(0.24, 0.14, 0.34), BOOT, riderG, 0, 0.11, -0.3);
    this._mesh(new THREE.BoxGeometry(0.24, 0.14, 0.34), BOOT, riderG, 0, 0.11, 0.3);

    this.bodyG = new THREE.Group();
    this.torso = this._mesh(new THREE.CapsuleGeometry(0.17, 0.4, 4, 8), JACKET, this.bodyG, 0, 0.95, 0);
    this._mesh(new THREE.SphereGeometry(0.155, 12, 10), SKIN, this.bodyG, 0, 1.36, 0);
    this._mesh(new THREE.CylinderGeometry(0.16, 0.165, 0.12, 12), BEANIE, this.bodyG, 0, 1.46, 0);
    this._mesh(new THREE.BoxGeometry(0.07, 0.075, 0.24), 0x1d2430, this.bodyG, 0.12, 1.37, 0);

    // arms pivot at the shoulders
    this.shoulderF = new THREE.Group();
    this.shoulderF.position.set(0, 1.18, -0.2);
    this._mesh(new THREE.CapsuleGeometry(0.065, 0.34, 4, 8), JACKET, this.shoulderF, 0, -0.2, 0);
    this.shoulderB = new THREE.Group();
    this.shoulderB.position.set(0, 1.18, 0.2);
    this._mesh(new THREE.CapsuleGeometry(0.065, 0.34, 4, 8), JACKET, this.shoulderB, 0, -0.2, 0);
    this.bodyG.add(this.shoulderF, this.shoulderB);
    riderG.add(this.bodyG);

    this.riderG = riderG;
    this.boardG = boardG;
    this.root.add(boardG, riderG);
  }

  // --- state ---------------------------------------------------------------

  reset() {
    this.pos.set(0, groundHeight(0, -5), -5);
    this.heading = 0;          // 0 = straight downhill (-z)
    this.speed = 9;
    this.vy = 0;
    this.vyGround = 0;         // vertical rate while following terrain
    this.velX = 0; this.velZ = 0;
    this.grounded = true;
    this.airTime = 0;
    this.spinAngle = 0;
    this.spinVel = 0;
    this.grabTime = 0;
    this.hearts = 3;
    this.alive = true;
    this.crashTimer = 0;
    this.invulnTimer = 0;
    this.crashSpin = 0;
    this._lean = 0;
    this._crouch = 0;
    this._smoothN.set(0, 1, 0);
    this.root.visible = true;
  }

  // --- physics -------------------------------------------------------------

  update(dt, input, world, time) {
    const events = [];
    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      this._updateCrashed(dt, world);
      this._updateVisual(dt, input, time);
      return events;
    }
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    if (this.grounded) this._updateGrounded(dt, input, world, events);
    else this._updateAirborne(dt, input, world, events);

    if (this.alive) {
      this._checkObstacles(world, events);
      this._checkCoins(world, events);
    }
    this._updateVisual(dt, input, time);
    return events;
  }

  _updateGrounded(dt, input, world, events) {
    const steer = this.alive ? input.steer : 0;
    const grip = U.clamp(this.speed / 9, 0.35, 1);
    this.heading += steer * PHYS.STEER * grip * (input.tuck ? 0.55 : 1) * dt;

    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    const g = groundGrad(this.pos.x, this.pos.z);
    const slopeAccel = -PHYS.G * (g.dx * fx + g.dz * fz);
    const drag = PHYS.DRAG * (input.tuck ? 0.55 : 1) * this.speed * this.speed;
    const scrub = PHYS.CARVE_SCRUB * Math.abs(steer) * this.speed;
    this.speed += (slopeAccel - drag - PHYS.FRICTION - scrub) * dt;
    if (this.alive && this.speed < PHYS.MIN_SPEED) {
      this.speed = U.approach(this.speed, PHYS.MIN_SPEED, 4, dt);  // skate push
    }
    this.speed = U.clamp(this.speed, 0, PHYS.MAX_SPEED);

    const oldY = this.pos.y;
    const wasOnRamp = world.onRamp(this.pos.x, this.pos.z, this.pos.z);
    this.pos.x = U.clamp(this.pos.x + fx * this.speed * dt, -70, 70);
    this.pos.z += fz * this.speed * dt;

    const newH = world.surfaceHeight(this.pos.x, this.pos.z, this.pos.z);
    const expected = oldY + this.vyGround * dt;

    if (newH < expected - 0.32 && this.speed > 7) {
      // ground fell away — we're airborne off a crest, drop or ramp lip
      this.grounded = false;
      this.vy = Math.max(this.vyGround, 0);
      this.velX = fx * this.speed;
      this.velZ = fz * this.speed;
      this.airTime = 0;
      this.pos.y = Math.max(this.pos.y, newH);
      if (wasOnRamp) {
        this.vy = Math.max(this.vy, this.speed * 0.42 + 2);
        events.push({ t: 'launch' });
      }
    } else {
      this.vyGround = U.clamp((newH - oldY) / dt, -40, 40);
      this.pos.y = newH;

      if (this.alive && input.jump) {
        this.grounded = false;
        this.vy = 6.2 + this.speed * 0.06 + Math.max(this.vyGround, 0) * 0.5;
        this.velX = fx * this.speed;
        this.velZ = fz * this.speed;
        this.airTime = 0;
        events.push({ t: 'jump' });
      }
    }
  }

  _updateAirborne(dt, input, world, events) {
    this.airTime += dt;
    this.pos.x = U.clamp(this.pos.x + this.velX * dt, -70, 70);
    this.pos.z += this.velZ * dt;
    this.pos.y += this.vy * dt;
    this.vy -= PHYS.G * dt;

    // tricks
    const spinTarget = (this.alive ? input.steer : 0) * PHYS.SPIN_RATE;
    this.spinVel = U.damp(this.spinVel, spinTarget, 6, dt);
    this.spinAngle += this.spinVel * dt;
    if (input.grab && this.alive) this.grabTime += dt;

    const ground = world.surfaceHeight(this.pos.x, this.pos.z, this.pos.z);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.grounded = true;
      this.vyGround = 0;
      this.speed = Math.min(Math.hypot(this.velX, this.velZ), PHYS.MAX_SPEED);

      // impact along the surface normal (soft when landing on a downslope)
      groundNormal(this.pos.x, this.pos.z, this._n);
      const impact = -(this.velX * this._n.x + this.vy * this._n.y + this.velZ * this._n.z);
      this._scoreTrick(events);
      if (impact > 16) {
        this.speed *= 0.6;
        events.push({ t: 'land', hard: true });
      } else if (this.airTime > 0.25) {
        events.push({ t: 'land', hard: false });
      }
      this.spinAngle = 0;
      this.spinVel = 0;
      this.grabTime = 0;
      this.vy = 0;
    }
  }

  _scoreTrick(events) {
    if (this.airTime < 0.45) return;
    const deg = Math.abs(this.spinAngle) * 180 / Math.PI;
    const n180 = Math.round(deg / 180);
    const grabPts = Math.floor(this.grabTime * 80);
    if (n180 >= 1) {
      const table = [0, 100, 250, 450, 700, 1000, 1350];
      const base = table[U.clamp(n180, 0, 6)] || 1350;
      const residual = Math.abs(deg - n180 * 180);
      const clean = residual < 40;
      let pts = base + grabPts;
      if (!clean) { pts = Math.floor(pts * 0.5); this.speed *= 0.7; }
      let label = `${n180 * 180}°`;
      if (this.grabTime > 0.3) label += ' GRAB';
      if (!clean) label += ' (sketchy)';
      events.push({ t: 'trick', label, pts, clean });
    } else if (this.grabTime > 0.35) {
      events.push({ t: 'trick', label: 'GRAB', pts: 50 + grabPts, clean: true });
    }
  }

  _checkObstacles(world, events) {
    if (this.invulnTimer > 0) return;
    for (const o of world.collidersNear(this.pos.z)) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      if (dx * dx + dz * dz < (o.r + 0.45) * (o.r + 0.45) && this.pos.y < o.top) {
        this.hearts--;
        this.crashTimer = 1.15;
        this.invulnTimer = 2.6;
        this.crashSpin = 0;
        this.speed = 3;
        this.vy = 0;
        this.spinAngle = 0;
        this.spinVel = 0;
        this.grabTime = 0;
        if (!this.grounded) {
          this.grounded = true;
          this.pos.y = world.surfaceHeight(this.pos.x, this.pos.z, this.pos.z);
        }
        if (this.hearts <= 0) {
          this.alive = false;
          events.push({ t: 'dead' });
        } else {
          events.push({ t: 'crash', left: this.hearts });
        }
        return;
      }
    }
  }

  _checkCoins(world, events) {
    for (const c of world.coinsNear(this.pos.z)) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, dy = this.pos.y + 0.8 - c.y;
      if (dx * dx + dz * dz < 1.9 && dy * dy < 2.9) {
        c.taken = true;
        c.group.visible = false;
        events.push({ t: 'coin', x: c.x, y: c.y, z: c.z });
      }
    }
  }

  _updateCrashed(dt, world) {
    // tumble to a stop
    this.speed = Math.max(0, this.speed - 14 * dt);
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    this.pos.x = U.clamp(this.pos.x + fx * this.speed * dt, -70, 70);
    this.pos.z += fz * this.speed * dt;
    this.pos.y = world.surfaceHeight(this.pos.x, this.pos.z, this.pos.z);
    this.crashSpin += 11 * dt;
  }

  // --- visuals -------------------------------------------------------------

  _updateVisual(dt, input, time) {
    this.root.position.copy(this.pos);

    // orientation: surface alignment * heading yaw * trick spin * carve lean
    if (this.grounded) {
      groundNormal(this.pos.x, this.pos.z, this._n);
    } else {
      this._n.set(0, 1, 0);
    }
    this._smoothN.lerp(this._n, 1 - Math.exp(-8 * dt)).normalize();
    this._qAlign.setFromUnitVectors(this._up, this._smoothN);

    const yawVis = this.heading + this.spinAngle;
    this._qYaw.setFromAxisAngle(this._up, -yawVis);
    this._qAlign.multiply(this._qYaw);

    if (!this.grounded) {
      this._qTmp.setFromAxisAngle(this._xAxis, U.clamp(this.vy * 0.03, -0.4, 0.4));
      this._qAlign.multiply(this._qTmp);
    }

    const steer = this.grounded && this.alive && this.crashTimer <= 0 ? input.steer : 0;
    const leanTarget = -steer * U.clamp(this.speed / 18, 0, 1) * 0.55;
    this._lean = U.damp(this._lean, leanTarget, 8, dt);
    this._qTmp.setFromAxisAngle(this._zAxis, this._lean);
    this._qAlign.multiply(this._qTmp);

    if (this.crashTimer > 0) {
      this._qTmp.setFromAxisAngle(this._xAxis, this.crashSpin);
      this._qAlign.multiply(this._qTmp);
    }
    this.root.quaternion.copy(this._qAlign);

    // pose: crouch for tucks/grabs, arms out when carving, flail in the air
    let crouchT = 0;
    if (this.grounded) crouchT = input.tuck ? 0.75 : Math.abs(steer) * 0.3;
    else crouchT = input.grab ? 0.9 : 0.35;
    this._crouch = U.damp(this._crouch, crouchT, 7, dt);
    const c = this._crouch;
    this.bodyG.position.y = -c * 0.3;
    this.bodyG.rotation.z = -0.12 - c * 0.35;      // lean into facing (+x)
    this.legF.scale.y = this.legB.scale.y = 1 - c * 0.4;
    this.legF.position.y = this.legB.position.y = 0.35 * (1 - c * 0.4);

    const airFlail = this.grounded ? 0 : 0.7;
    this.shoulderF.rotation.x = U.damp(this.shoulderF.rotation.x, -0.5 - airFlail - c * 0.4, 8, dt);
    this.shoulderB.rotation.x = U.damp(this.shoulderB.rotation.x,
      (!this.grounded && input.grab) ? 1.9 : 0.5 + airFlail * 0.6, 8, dt);
    this.shoulderF.rotation.z = U.damp(this.shoulderF.rotation.z, -0.35 - Math.abs(this._lean), 8, dt);
    this.shoulderB.rotation.z = U.damp(this.shoulderB.rotation.z, 0.35 + airFlail, 8, dt);

    // flicker while invulnerable
    this.root.visible = this.invulnTimer <= 0 || Math.floor(time * 12) % 2 === 0;
    if (!this.alive && this.crashTimer <= 0) this.root.visible = true;
  }
}
