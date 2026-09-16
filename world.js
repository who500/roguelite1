/**
 * world.js - Процедурный генератор локации (Остров / Ферма)
 * Создает тайловую карту, водные берега, тропинки, грядки, деревья и коллизии.
 */

const World = {
  width: 46,
  height: 40,
  tileSize: 16,

  // Слои тайлов: 0 - вода, 1 - трава, 2 - трава с цветами, 3 - земля/тропинка, 4 - вспаханная земля, 5 - мост
  tiles: [],
  collisionMap: [], // true = непроходимо

  // Объекты с Y-сортировкой (персонаж, деревья, домик, костер)
  objects: [],

  // Грядки с культурами
  crops: [],

  // Координаты важных точек
  cabinPos: { x: 18, y: 12 },
  campfirePos: { x: 26, y: 22 },
  playerSpawn: { x: 20 * 16, y: 17 * 16 },

  init() {
    this.generateTerrain();
    this.placeStructuresAndForest();
    this.setupFarmPatch();
  },

  // Простой детерминированный шум/псевдо-рандом
  pseudoNoise(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return n - Math.floor(n);
  },

  generateTerrain() {
    this.tiles = [];
    this.collisionMap = [];

    const cx = this.width / 2;
    const cy = this.height / 2;

    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = [];
      this.collisionMap[y] = [];
      for (let x = 0; x < this.width; x++) {
        // Расстояние до центра для формирования береговой линии острова
        const dx = (x - cx) / (this.width * 0.46);
        const dy = (y - cy) / (this.height * 0.44);
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Добавим волнистость берегам через псевдо-шум
        const noise = (Math.sin(x * 0.3) + Math.cos(y * 0.3)) * 0.08;
        const isLand = (dist + noise) < 0.88;

        // Извилистая река с северо-запада на юго-восток
        const riverX = 33 + Math.sin(y * 0.25) * 3;
        const isRiver = Math.abs(x - riverX) < 2.0 && y > 6 && y < 36;

        if (!isLand || isRiver) {
          this.tiles[y][x] = 0; // Вода
          this.collisionMap[y][x] = true;
        } else {
          // Трава
          const flowerChance = this.pseudoNoise(x, y);
          this.tiles[y][x] = flowerChance > 0.85 ? 2 : 1;
          this.collisionMap[y][x] = false;
        }
      }
    }

    // Деревянный мостик через реку (x около 31-35, y = 20)
    for (let x = 30; x <= 36; x++) {
      if (this.tiles[20][x] === 0) {
        this.tiles[20][x] = 5; // Мост
        this.tiles[21][x] = 5;
        this.collisionMap[20][x] = false;
        this.collisionMap[21][x] = false;
      }
    }

    // Протаптываем тропинки от дома к костру и мосту
    this.carvePath(20, 16, 26, 22); // Дом -> Костер
    this.carvePath(26, 22, 31, 20); // Костер -> Мост
  },

  carvePath(x1, y1, x2, y2) {
    let curX = x1;
    let curY = y1;
    while (curX !== x2 || curY !== y2) {
      if (this.tiles[curY][curX] !== 0 && this.tiles[curY][curX] !== 5) {
        this.tiles[curY][curX] = 3; // Тропинка
        // Случайно расширяем на 1 тайл
        if (this.pseudoNoise(curX, curY) > 0.4 && this.tiles[curY + 1]?.[curX] === 1) {
          this.tiles[curY + 1][curX] = 3;
        }
      }
      if (Math.random() < 0.5) {
        if (curX < x2) curX++;
        else if (curX > x2) curX--;
      } else {
        if (curY < y2) curY++;
        else if (curY > y2) curY--;
      }
    }
  },

  placeStructuresAndForest() {
    this.objects = [];

    // 1. Домик фермера (64x64, центр на 18, 12)
    const cabWorldX = this.cabinPos.x * 16;
    const cabWorldY = this.cabinPos.y * 16;
    this.objects.push({
      type: 'cabin',
      x: cabWorldX,
      y: cabWorldY,
      sortY: cabWorldY + 56, // Y-сортировка у основания
      width: 64,
      height: 64
    });

    // Блокируем коллизии под домом (стены и фундамент, оставляя порог у двери)
    for (let cy = this.cabinPos.y + 2; cy <= this.cabinPos.y + 3; cy++) {
      for (let cx = this.cabinPos.x; cx < this.cabinPos.x + 4; cx++) {
        // Оставляем дверь проходимой
        if (!(cx === this.cabinPos.x + 1 && cy === this.cabinPos.y + 3)) {
          this.collisionMap[cy][cx] = true;
        }
      }
    }

    // 2. Костер на поляне
    const campWorldX = this.campfirePos.x * 16;
    const campWorldY = this.campfirePos.y * 16;
    this.objects.push({
      type: 'campfire',
      x: campWorldX,
      y: campWorldY,
      sortY: campWorldY + 12,
      width: 16,
      height: 16
    });
    this.collisionMap[this.campfirePos.y][this.campfirePos.x] = true;

    // 3. Фонарные столбы
    const lamps = [
      { x: 17, y: 16 },
      { x: 23, y: 16 },
      { x: 29, y: 20 },
      { x: 12, y: 22 }
    ];
    lamps.forEach(l => {
      this.objects.push({
        type: 'lamp',
        x: l.x * 16,
        y: l.y * 16,
        sortY: l.y * 16 + 22,
        width: 16,
        height: 24
      });
      this.collisionMap[l.y][l.x] = true;
    });

    // 4. Деревья (дубы и ели в естественных рощах)
    for (let y = 3; y < this.height - 4; y += 2) {
      for (let x = 3; x < this.width - 4; x += 2) {
        // Не спавним рядом с домом, костром и грядками
        const distCabin = Math.hypot(x - 20, y - 14);
        const distCamp = Math.hypot(x - this.campfirePos.x, y - this.campfirePos.y);
        const distFarm = Math.hypot(x - 13, y - 19);

        if (distCabin > 4.5 && distCamp > 3.5 && distFarm > 4.5) {
          if (this.tiles[y][x] === 1 || this.tiles[y][x] === 2) {
            const treeChance = this.pseudoNoise(x * 3, y * 3);
            if (treeChance > 0.72) {
              const isPine = (x < 16 && y < 18) || (treeChance > 0.88);
              const treeType = isPine ? 'pine' : 'oak';

              this.objects.push({
                type: treeType,
                x: x * 16 - 8,
                y: y * 16 - 32,
                sortY: y * 16 + 10,
                width: 32,
                height: 48
              });
              this.collisionMap[y][x] = true;
            }
          }
        }
      }
    }

    // 5. Декоративные камушки
    const rocks = [
      { x: 16, y: 22 },
      { x: 24, y: 19 },
      { x: 27, y: 25 },
      { x: 19, y: 26 },
      { x: 38, y: 18 }
    ];
    rocks.forEach(r => {
      if (this.tiles[r.y]?.[r.x] === 1) {
        this.objects.push({
          type: 'rock',
          x: r.x * 16,
          y: r.y * 16,
          sortY: r.y * 16 + 12,
          width: 16,
          height: 16
        });
        this.collisionMap[r.y][r.x] = true;
      }
    });
  },

  setupFarmPatch() {
    this.crops = [];
    // Грядка 4x3 слева от дорожки (тайлы 11..14, 18..20)
    for (let gy = 18; gy <= 20; gy++) {
      for (let gx = 11; gx <= 14; gx++) {
        this.tiles[gy][gx] = 4; // Вспаханная земля
        // Добавляем культуру
        const seedType = (gx + gy) % 2 === 0 ? 'carrot' : 'strawberry';
        this.crops.push({
          tileX: gx,
          tileY: gy,
          type: seedType,
          growthStage: 2, // 0 = росток, 1 = полуспелый, 2 = созревший
          lastHarvest: 0
        });
      }
    }

    // Заборчик вокруг грядки
    for (let gx = 10; gx <= 15; gx++) {
      this.addFence(gx, 17);
      this.addFence(gx, 21);
    }
    for (let gy = 18; gy <= 20; gy++) {
      this.addFence(10, gy);
      // В правом заборе оставляем калитку на gy = 19
      if (gy !== 19) {
        this.addFence(15, gy);
      }
    }
  },

  addFence(tx, ty) {
    this.objects.push({
      type: 'fence',
      x: tx * 16,
      y: ty * 16,
      sortY: ty * 16 + 12,
      width: 16,
      height: 16
    });
    this.collisionMap[ty][tx] = true;
  },

  // Проверка проходимости координаты в мировых пикселях
  isBlocked(worldX, worldY) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return true;
    return !!this.collisionMap[ty][tx];
  },

  // Взаимодействие с урожаем (сбор / посадка)
  interactCrop(playerX, playerY) {
    const pTileX = Math.round(playerX / 16);
    const pTileY = Math.round(playerY / 16);

    // Ищем ближайшую клетку грядки
    for (const crop of this.crops) {
      const dist = Math.hypot(crop.tileX - pTileX, crop.tileY - pTileY);
      if (dist <= 1.4) {
        if (crop.growthStage === 2) {
          // Собираем спелый урожай
          crop.growthStage = 0; // Снова саженец
          return {
            action: 'harvest',
            item: crop.type === 'carrot' ? 'Морковь 🥕' : 'Клубника 🍓',
            crop
          };
        } else {
          // Ускоряем рост саженца (полив)
          crop.growthStage = (crop.growthStage + 1) % 3;
          return {
            action: 'water',
            item: 'Грядка полита 💧',
            crop
          };
        }
      }
    }
    return null;
  }
};
