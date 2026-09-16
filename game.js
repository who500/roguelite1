/**
 * game.js - Полноценный 2D RPG мир на базе проверенной библиотеки Phaser 3
 * Использует официальный тайлмап Tiled и согласованный 32px атлас:
 * - Идеальная геометрия без швов и артефактов
 * - Честная послойная глубина (крыши и листва естественно перекрывают персонажа)
 * - Аркадная физика коллизий со стенами, заборами и объектами
 * - Управление WASD / Стрелки, плавная камера, смена времени суток и звуки
 */

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Загрузка официального экструдированного тайлсета и карты Tiled
    this.load.image('tiles', 'assets/tuxmon-sample-32px-extruded.png');
    this.load.tilemapTiledJSON('map', 'assets/tuxemon-town.json');

    // Загрузка согласованного атласа персонажа с анимациями
    this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');

    // Генерация процедурных текстур для анимаций и частиц
    this.createParticleTextures();
  }

  createParticleTextures() {
    // 1. Капля воды для фонтана
    const gWater = this.make.graphics({ x: 0, y: 0, add: false });
    gWater.fillStyle(0x70d6ff, 1);
    gWater.fillCircle(3, 3, 3);
    gWater.fillStyle(0xffffff, 0.9);
    gWater.fillCircle(2, 2, 1);
    gWater.generateTexture('drop', 6, 6);

    // 2. Брызги и пена
    const gSplash = this.make.graphics({ x: 0, y: 0, add: false });
    gSplash.fillStyle(0xffffff, 0.85);
    gSplash.fillCircle(2, 2, 2);
    gSplash.generateTexture('splash', 4, 4);

    // 3. Клубы дыма из трубы
    const gSmoke = this.make.graphics({ x: 0, y: 0, add: false });
    gSmoke.fillStyle(0xb8c0cb, 0.5);
    gSmoke.fillCircle(8, 8, 8);
    gSmoke.fillStyle(0xd5dde8, 0.35);
    gSmoke.fillCircle(6, 6, 5);
    gSmoke.generateTexture('smoke', 16, 16);

    // 4. Лепестки сакуры/листья в воздухе
    const gPetal = this.make.graphics({ x: 0, y: 0, add: false });
    gPetal.fillStyle(0xff99bb, 0.85);
    gPetal.fillEllipse(4, 2, 4, 2);
    gPetal.generateTexture('petal', 8, 4);

    // 5. Ночной светлячок
    const gFly = this.make.graphics({ x: 0, y: 0, add: false });
    gFly.fillStyle(0xd4ff55, 0.3);
    gFly.fillCircle(4, 4, 4);
    gFly.fillStyle(0xffffff, 0.95);
    gFly.fillCircle(4, 4, 1.5);
    gFly.generateTexture('firefly', 8, 8);

    // 6. Каменный фонтан (64x64)
    const gFountain = this.make.graphics({ x: 0, y: 0, add: false });
    // Внешний каменный обод (тень и основной камень)
    gFountain.fillStyle(0x2d3748, 1);
    gFountain.fillCircle(32, 34, 30);
    gFountain.fillStyle(0x4a5568, 1);
    gFountain.fillCircle(32, 32, 30);
    gFountain.fillStyle(0x718096, 1);
    gFountain.fillCircle(32, 30, 29);
    gFountain.fillStyle(0xa0aec0, 1);
    gFountain.fillCircle(32, 29, 28);

    // Внутренняя чаша бассейна (глубина)
    gFountain.fillStyle(0x1a202c, 1);
    gFountain.fillCircle(32, 32, 25);
    // Водная гладь
    gFountain.fillStyle(0x0284c7, 1);
    gFountain.fillCircle(32, 32, 23);
    gFountain.fillStyle(0x38bdf8, 0.9);
    gFountain.fillCircle(32, 32, 20);

    // Каменная кладка (штрихи блоков по периметру)
    gFountain.fillStyle(0x2d3748, 0.9);
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      gFountain.fillRect(32 + Math.cos(ang) * 26 - 1, 32 + Math.sin(ang) * 26 - 1, 3, 3);
    }

    // Центральный каменный постамент
    gFountain.fillStyle(0x2d3748, 1);
    gFountain.fillCircle(32, 33, 9);
    gFountain.fillStyle(0x718096, 1);
    gFountain.fillCircle(32, 31, 8);
    gFountain.fillStyle(0xcfd8dc, 1);
    gFountain.fillCircle(32, 29, 6);
    // Вершина сопла излива
    gFountain.fillStyle(0xffffff, 1);
    gFountain.fillCircle(32, 27, 2.5);
    gFountain.generateTexture('fountain_base', 64, 64);

    // 7. Анимируемый водный диск с переливом (44x44)
    const gWaterRing = this.make.graphics({ x: 0, y: 0, add: false });
    gWaterRing.fillStyle(0x0ea5e9, 0.45);
    gWaterRing.fillCircle(22, 22, 20);
    gWaterRing.lineStyle(2, 0xe0f2fe, 0.7);
    gWaterRing.strokeCircle(22, 22, 15);
    gWaterRing.lineStyle(1.5, 0xffffff, 0.85);
    gWaterRing.strokeCircle(22, 22, 9);
    gWaterRing.generateTexture('fountain_water', 44, 44);

    // 8. Золотая искра монетки
    const gCoin = this.make.graphics({ x: 0, y: 0, add: false });
    gCoin.fillStyle(0xfbbf24, 1);
    gCoin.fillCircle(3, 3, 3);
    gCoin.fillStyle(0xfffbeb, 0.9);
    gCoin.fillCircle(2, 2, 1.2);
    gCoin.generateTexture('coin', 6, 6);
  }

  create() {
    // 1. Инициализация карты
    const map = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage('tuxmon-sample-32px-extruded', 'tiles');

    // Слои Tiled:
    // Below Player: земля, тропинки, вода
    const belowLayer = map.createLayer('Below Player', tileset, 0, 0);
    // World: дома, заборы, стволы деревьев (с коллизиями)
    const worldLayer = map.createLayer('World', tileset, 0, 0);
    // Above Player: крыши домов, кроны деревьев (перекрывают персонажа сверху)
    const aboveLayer = map.createLayer('Above Player', tileset, 0, 0);

    worldLayer.setCollisionByProperty({ collides: true });
    aboveLayer.setDepth(10); // Слой выше персонажа

    // 2. Спавн персонажа
    let spawnX = 400;
    let spawnY = 400;
    const spawnPoint = map.findObject('Objects', (obj) => obj.name === 'Spawn Point');
    if (spawnPoint) {
      spawnX = spawnPoint.x;
      spawnY = spawnPoint.y;
    }

    this.player = this.physics.add
      .sprite(spawnX, spawnY, 'atlas', 'misa-front')
      .setSize(24, 30)
      .setOffset(4, 34);

    this.player.setDepth(5);
    this.physics.add.collider(this.player, worldLayer);

    // 3. Создание анимаций персонажа
    const anims = this.anims;
    anims.create({
      key: 'misa-left-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-left-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: 'misa-right-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-right-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: 'misa-front-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-front-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: 'misa-back-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-back-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });

    // 4. Камера
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setZoom(1.8);

    // 5. Управление WASD и стрелки
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // 6. Отладка коллизий
    this.debugGraphics = this.add.graphics().setAlpha(0.75).setDepth(20).setVisible(false);
    worldLayer.renderDebug(this.debugGraphics, {
      tileColor: null,
      collidingTileColor: new Phaser.Display.Color(243, 134, 48, 200),
      faceColor: new Phaser.Display.Color(40, 39, 37, 255)
    });

    this.input.keyboard.on('keydown-D', () => this.toggleDebug());
    document.getElementById('btnDebugToggle')?.addEventListener('click', () => this.toggleDebug());

    // 7. Каменный фонтан на центральной площади городка (x: 432, y: 980)
    const fx = 432;
    const fy = 980;

    this.fountain = this.physics.add.staticSprite(fx, fy, 'fountain_base');
    this.fountain.body.setCircle(22, 10, 10);
    this.fountain.setDepth(6);
    this.physics.add.collider(this.player, this.fountain);

    // Анимированная водная рябь в чаше фонтана
    this.fountainWater = this.add.sprite(fx, fy, 'fountain_water').setDepth(6.1);
    this.tweens.add({
      targets: this.fountainWater,
      alpha: { from: 0.5, to: 0.92 },
      scaleX: { from: 0.95, to: 1.05 },
      scaleY: { from: 0.95, to: 1.05 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 8. Контекстные частицы фонтана:
    // Струя воды, взлетающая из сопла вверх и падающая под гравитацией
    this.waterSpray = this.add.particles(fx, fy - 8, 'drop', {
      speed: { min: 45, max: 85 },
      angle: { min: 250, max: 290 },
      gravityY: 140,
      lifespan: { min: 650, max: 950 },
      scale: { start: 1.1, end: 0.3 },
      alpha: { start: 0.9, end: 0.2 },
      frequency: 45,
      quantity: 2,
      depth: 7
    });

    // Брызги и белая пена на поверхности чаши
    this.waterSplash = this.add.particles(fx, fy + 4, 'splash', {
      speed: { min: 15, max: 35 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 450 },
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 0.7, end: 0 },
      frequency: 70,
      quantity: 1,
      depth: 7
    });

    // Частицы броска монетки (искры)
    this.coinParticles = this.add.particles(fx, fy, 'coin', {
      speed: { min: 35, max: 75 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 400, max: 700 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
      depth: 8
    });

    // Подсказка взаимодействия с фонтаном
    this.fountainPrompt = this.add.text(fx, fy - 45, '⛲ Фонтан желаний [E] Бросить монетку', {
      fontFamily: 'Outfit, sans-serif',
      fontSize: '13px',
      color: '#fef08a',
      backgroundColor: 'rgba(15, 23, 42, 0.88)',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setDepth(25).setVisible(false);

    this.input.keyboard.on('keydown-E', () => this.interactFountain());

    // 9. Дым из печных труб на крышах домов
    const chimneys = [
      { x: 180, y: 890 },
      { x: 400, y: 890 },
      { x: 660, y: 890 }
    ];
    chimneys.forEach(c => {
      this.add.particles(c.x, c.y, 'smoke', {
        speedX: { min: 8, max: 24 },
        speedY: { min: -25, max: -45 },
        scale: { start: 0.3, end: 1.3 },
        alpha: { start: 0.45, end: 0 },
        lifespan: { min: 2000, max: 3200 },
        frequency: 380,
        depth: 12
      });
    });

    // 10. Лепестки и листья в воздухе (легкий ветерок)
    this.petals = this.add.particles(0, 0, 'petal', {
      x: { min: 50, max: 1250 },
      y: { min: 50, max: 1250 },
      speedX: { min: 20, max: 50 },
      speedY: { min: 10, max: 25 },
      rotate: { min: 0, max: 360 },
      scale: { min: 0.6, max: 1.0 },
      alpha: { start: 0.7, end: 0.1 },
      lifespan: 8000,
      frequency: 350,
      depth: 15
    });

    // 11. Ночные светлячки
    this.fireflies = this.add.particles(0, 0, 'firefly', {
      x: { min: 50, max: 1250 },
      y: { min: 50, max: 1250 },
      speedX: { min: -12, max: 12 },
      speedY: { min: -10, max: 10 },
      scale: { min: 0.6, max: 1.2 },
      alpha: { start: 0.1, end: 0.85 },
      lifespan: { min: 2500, max: 4000 },
      frequency: 280,
      emitting: false,
      depth: 15
    });

    // 12. Горячие клавиши для времени и звука
    this.timeOfDay = 0.28;
    this.timeSpeed = 0.005;
    this.input.keyboard.on('keydown-T', () => this.advanceTime());
    this.input.keyboard.on('keydown-M', () => this.toggleSound());

    document.getElementById('btnTimeToggle')?.addEventListener('click', () => this.advanceTime());
    document.getElementById('btnSoundToggle')?.addEventListener('click', () => this.toggleSound());

    // Ночной/атмосферный оверлей поверх экрана
    this.nightOverlay = this.add.rectangle(0, 0, 4000, 3000, 0x0e1228, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Звуки шагов
    this.stepTimer = 0;
    SoundEngine.init();

    // Поддержка клика мыши / тапа для плавного перемещения к точке (Click-to-Move)
    this.targetPos = null;
    this.input.on('pointerdown', (pointer) => {
      if (pointer.event.target && pointer.event.target.closest('#hud-container')) return;
      this.targetPos = { x: pointer.worldX, y: pointer.worldY };
    });

    this.showToast('Городок загружен на движке Phaser 3! Фонтан и частицы активны ⛲');
  }

  toggleDebug() {
    const isVis = !this.debugGraphics.visible;
    this.debugGraphics.setVisible(isVis);
    this.showToast(isVis ? 'Сетка коллизий включена' : 'Сетка коллизий скрыта');
  }

  advanceTime() {
    if (this.timeOfDay < 0.25) this.timeOfDay = 0.35;
    else if (this.timeOfDay < 0.6) this.timeOfDay = 0.68;
    else if (this.timeOfDay < 0.85) this.timeOfDay = 0.88;
    else this.timeOfDay = 0.12;

    SoundEngine.playClick();
    this.showToast('Время суток изменено ⏰');
  }

  toggleSound() {
    const active = SoundEngine.toggle();
    const btn = document.getElementById('btnSoundToggle');
    if (active) {
      if (btn) btn.textContent = '🔊 Звук: ВКЛ';
      this.showToast('Звуки и живой эмбиент включены 🎵');
    } else {
      if (btn) btn.textContent = '🔇 Звук: ВЫКЛ';
      this.showToast('Звук выключен');
    }
  }

  showToast(text) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  update(time, delta) {
    const dt = delta / 1000;
    const speed = 160;
    const prevVelocity = this.player.body.velocity.clone();

    // Сброс скорости
    this.player.body.setVelocity(0);

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    let isMoving = left || right || up || down;

    if (isMoving) {
      this.targetPos = null; // Клавиатура имеет приоритет
      if (left) this.player.body.setVelocityX(-speed);
      else if (right) this.player.body.setVelocityX(speed);

      if (up) this.player.body.setVelocityY(-speed);
      else if (down) this.player.body.setVelocityY(speed);

      this.player.body.velocity.normalize().scale(speed);

      if (left) this.player.anims.play('misa-left-walk', true);
      else if (right) this.player.anims.play('misa-right-walk', true);
      else if (up) this.player.anims.play('misa-back-walk', true);
      else if (down) this.player.anims.play('misa-front-walk', true);
    } else if (this.targetPos) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.targetPos.x, this.targetPos.y);
      if (dist < 8) {
        this.targetPos = null;
      } else {
        isMoving = true;
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.targetPos.x, this.targetPos.y);
        this.player.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) this.player.anims.play('misa-right-walk', true);
          else this.player.anims.play('misa-left-walk', true);
        } else {
          if (dy > 0) this.player.anims.play('misa-front-walk', true);
          else this.player.anims.play('misa-back-walk', true);
        }
      }
    }

    if (isMoving) {
      // Шаги
      this.stepTimer += dt;
      if (this.stepTimer >= 0.28) {
        this.stepTimer = 0;
        SoundEngine.playFootstep('grass');
      }
    } else {
      this.player.anims.stop();
      if (prevVelocity.x < 0) this.player.setTexture('atlas', 'misa-left');
      else if (prevVelocity.x > 0) this.player.setTexture('atlas', 'misa-right');
      else if (prevVelocity.y < 0) this.player.setTexture('atlas', 'misa-back');
      else if (prevVelocity.y > 0) this.player.setTexture('atlas', 'misa-front');
    }

    // Проверка близости к фонтану для подсказки взаимодействия
    if (this.fountain && this.fountainPrompt) {
      const distToFountain = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.fountain.x,
        this.fountain.y
      );
      this.fountainPrompt.setVisible(distToFountain < 75);
    }

    // Время суток и фильтр освещения
    this.timeOfDay = (this.timeOfDay + this.timeSpeed * dt) % 1.0;
    this.updateAtmosphere();
  }

  interactFountain() {
    if (!this.fountain) return;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.fountain.x, this.fountain.y);
    if (dist < 80) {
      SoundEngine.playCoinToss();
      setTimeout(() => SoundEngine.playWaterSplash(), 220);

      // Взрыв брызг и золотых искр монетки
      if (this.waterSpray) this.waterSpray.explode(35, this.fountain.x, this.fountain.y - 8);
      if (this.waterSplash) this.waterSplash.explode(25, this.fountain.x, this.fountain.y + 4);
      if (this.coinParticles) this.coinParticles.explode(20, this.fountain.x, this.fountain.y - 2);

      // Приятная анимация всплеска
      this.tweens.add({
        targets: [this.fountain, this.fountainWater],
        scaleX: 1.07,
        scaleY: 0.93,
        duration: 120,
        yoyo: true,
        ease: 'Quad.easeInOut'
      });

      this.showToast('Вы бросили монетку в фонтан! Желание обязательно сбудется ✨🪙');
    }
  }

  updateAtmosphere() {
    const totalMinutes = Math.floor(((this.timeOfDay * 24 + 6) % 24) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const formattedTime = `${String(displayHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;

    const timeEl = document.getElementById('timeDisplay');
    if (timeEl) timeEl.textContent = formattedTime;
    const progEl = document.getElementById('dayProgressFill');
    if (progEl) progEl.style.width = `${(this.timeOfDay * 100).toFixed(1)}%`;

    const iconEl = document.getElementById('celestialIcon');
    const phaseEl = document.getElementById('phaseDisplay');

    const isNightOrDusk = this.timeOfDay >= 0.65 || this.timeOfDay < 0.15;
    if (this.fireflies) {
      if (isNightOrDusk && !this.fireflies.emitting) {
        this.fireflies.start();
      } else if (!isNightOrDusk && this.fireflies.emitting) {
        this.fireflies.stop();
      }
    }

    if (this.nightOverlay) {
      if (this.timeOfDay >= 0.2 && this.timeOfDay < 0.6) {
        this.nightOverlay.setFillStyle(0x0e1228, 0.0);
        if (phaseEl) phaseEl.textContent = 'День';
        if (iconEl) iconEl.textContent = '☀️';
      } else if (this.timeOfDay >= 0.6 && this.timeOfDay < 0.75) {
        this.nightOverlay.setFillStyle(0x994422, 0.25);
        if (phaseEl) phaseEl.textContent = 'Закат';
        if (iconEl) iconEl.textContent = '🌇';
      } else if (this.timeOfDay >= 0.75 || this.timeOfDay < 0.1) {
        this.nightOverlay.setFillStyle(0x0b1026, 0.65);
        if (phaseEl) phaseEl.textContent = 'Ночь';
        if (iconEl) iconEl.textContent = '🌙';
      } else {
        this.nightOverlay.setFillStyle(0xbb6644, 0.2);
        if (phaseEl) phaseEl.textContent = 'Рассвет';
        if (iconEl) iconEl.textContent = '🌅';
      }
    }

    SoundEngine.updateAmbient(this.timeOfDay, 200);
  }
}

// Конфигурация Phaser 3
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [MainScene]
};

window.addEventListener('DOMContentLoaded', () => {
  new Phaser.Game(config);
});
