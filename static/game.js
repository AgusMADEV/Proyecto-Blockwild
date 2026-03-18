// ============================================================================
// MINECRAFT ISOMÉTRICO - JUEGO PRINCIPAL
// ============================================================================

// Configuración inicial del juego
const CONFIG = {
  WORLD_SIZE: 32,           // Tamaño del mundo (32x32 bloques)
  BLOCK_SIZE: 1,            // Tamaño de cada bloque
  CAMERA_DISTANCE: 15,      // Distancia de la cámara al personaje
  CAMERA_ANGLE: 45,         // Ángulo isométrico en grados
  CAMERA_HEIGHT: 12,        // Altura de la cámara
  ZOOM_SPEED: 2,            // Velocidad del zoom
  ROTATION_SPEED: 2,        // Velocidad de rotación
  PLAYER_SPEED: 0.1,        // Velocidad de movimiento del personaje
  PLAYER_HEIGHT: 1.8,       // Altura del personaje
  TERRAIN_SCALE: 0.3,       // Escala del ruido para terreno
  TERRAIN_HEIGHT: 4,        // Altura máxima del terreno
};

// Tipos de bloques con sus colores
const BLOCK_TYPES = {
  grass: { color: 0x4CAF50, name: 'Grass' },
  dirt:  { color: 0x795548, name: 'Dirt' },
  stone: { color: 0x9E9E9E, name: 'Stone' }
};

// Referencias DOM
const playerNameInput = document.getElementById('playerName');
const startBtn = document.getElementById('startBtn');

// Variables globales del juego
let scene, camera, renderer, raycaster, mouse;
let blocks = [];
let player;
let playerMesh;
let selectedBlockType = 'grass';
let hoveredBlock = null;
let cameraAngle = 45;
let cameraDistance = CONFIG.CAMERA_DISTANCE;
let gameStarted = false;
let worldSeed = Math.random() * 10000;

// Estado de la sesión
let gameState = {
  playerId: null,
  sessionId: null,
  playerName: '',
  startTime: 0,
  blocksPlaced: 0,
  blocksDestroyed: 0
};

// Sistema de items e inventario
let items = [];
let inventory = {
  grass: 0,
  dirt: 0,
  stone: 0
};

// Controles de movimiento
let keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false
};

// Geometrías reutilizables
let blockGeometry;
let blockMaterials = {};

// FPS Counter
let lastTime = Date.now();
let frames = 0;

// ============================================================================
// API COMMUNICATION
// ============================================================================

async function api(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(endpoint, options);
  return response.json();
}

async function registerPlayer(name) {
  const data = await api('/api/player/register', 'POST', { name });
  if (!data.ok) throw new Error(data.error || 'Error al registrar jugador');
  return data.player;
}

async function startSession(playerId) {
  const data = await api('/api/session/start', 'POST', { 
    player_id: playerId, 
    mode: 'creative',
    world_seed: Math.floor(worldSeed)
  });
  if (!data.ok) throw new Error(data.error || 'Error al iniciar sesión');
  return data.session.id;
}

async function endSession() {
  if (!gameState.sessionId) return;
  
  const playtime = Math.floor((Date.now() - gameState.startTime) / 1000);
  
  await api('/api/session/end', 'POST', {
    session_id: gameState.sessionId,
    result: 'quit',
    blocks_placed: gameState.blocksPlaced,
    blocks_destroyed: gameState.blocksDestroyed,
    playtime_seconds: playtime
  }).catch(() => {});
}

function sendEvent(eventType, eventValue, payload = {}) {
  if (!gameState.sessionId) return;
  api('/api/session/event', 'POST', {
    session_id: gameState.sessionId,
    event_type: eventType,
    event_value: eventValue,
    payload
  }).catch(() => {});
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 40, 80);
  
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  updateCameraPosition();
  camera.lookAt(CONFIG.WORLD_SIZE / 2, 0, CONFIG.WORLD_SIZE / 2);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-container').appendChild(renderer.domElement);
  
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  blockGeometry = new THREE.BoxGeometry(CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE);
  blockGeometry.computeVertexNormals();
  
  for (let type in BLOCK_TYPES) {
    blockMaterials[type] = new THREE.MeshLambertMaterial({ 
      color: BLOCK_TYPES[type].color,
      flatShading: true
    });
  }
  
  setupLights();
  generateTerrain();
  createPlayer();
  setupEventListeners();
  animate();
}

function setupLights() {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(20, 30, 20);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -40;
  directionalLight.shadow.camera.right = 40;
  directionalLight.shadow.camera.top = 40;
  directionalLight.shadow.camera.bottom = -40;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);
}

function createPlayer() {
  const spawnX = CONFIG.WORLD_SIZE / 2 + (Math.random() - 0.5) * 4;
  const spawnZ = CONFIG.WORLD_SIZE / 2 + (Math.random() - 0.5) * 4;
  
  player = {
    x: spawnX,
    y: 10,
    z: spawnZ,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false
  };
  
  const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, CONFIG.PLAYER_HEIGHT - 0.5, 8);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;
  
  const headGeometry = new THREE.SphereGeometry(0.35, 8, 8);
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBAC });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = CONFIG.PLAYER_HEIGHT / 2;
  head.castShadow = true;
  
  playerMesh = new THREE.Group();
  playerMesh.add(body);
  playerMesh.add(head);
  playerMesh.position.set(player.x, player.y, player.z);
  
  scene.add(playerMesh);
}

// ============================================================================
// GENERACIÓN DEL TERRENO
// ============================================================================

function noise2D(x, z) {
  const n = Math.sin((x + worldSeed) * 12.9898 + (z + worldSeed) * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, z) {
  const corners = (noise2D(x-1, z-1) + noise2D(x+1, z-1) + 
                  noise2D(x-1, z+1) + noise2D(x+1, z+1)) / 16;
  const sides = (noise2D(x-1, z) + noise2D(x+1, z) + 
                noise2D(x, z-1) + noise2D(x, z+1)) / 8;
  const center = noise2D(x, z) / 4;
  return corners + sides + center;
}

function interpolate(a, b, blend) {
  const theta = blend * Math.PI;
  const f = (1 - Math.cos(theta)) * 0.5;
  return a * (1 - f) + b * f;
}

function getPerlinNoise(x, z) {
  const intX = Math.floor(x);
  const intZ = Math.floor(z);
  const fracX = x - intX;
  const fracZ = z - intZ;
  
  const v1 = smoothNoise(intX, intZ);
  const v2 = smoothNoise(intX + 1, intZ);
  const v3 = smoothNoise(intX, intZ + 1);
  const v4 = smoothNoise(intX + 1, intZ + 1);
  
  const i1 = interpolate(v1, v2, fracX);
  const i2 = interpolate(v3, v4, fracX);
  
  return interpolate(i1, i2, fracZ);
}

function generateTerrain() {
  console.log('🌍 Generando mundo 32x32 con terreno realista mejorado...');
  console.log('🎲 Semilla del mundo: ' + Math.floor(worldSeed));
  
  const heightMap = [];
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    heightMap[x] = [];
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      let height = 0;
      let amplitude = 1;
      let frequency = 1;
      
      for (let octave = 0; octave < 4; octave++) {
        const sampleX = (x / CONFIG.WORLD_SIZE) * frequency;
        const sampleZ = (z / CONFIG.WORLD_SIZE) * frequency;
        
        height += getPerlinNoise(sampleX * 10, sampleZ * 10) * amplitude;
        
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      height = (height + 1) / 2;
      
      const biomeNoise = getPerlinNoise(x * 0.05, z * 0.05);
      
      if (biomeNoise > 0.6) {
        height = Math.pow(height, 0.7) * 8;
      } else if (biomeNoise > 0.4) {
        height = height * 5;
      } else {
        height = Math.floor(height * 2.5);
      }
      
      heightMap[x][z] = Math.floor(Math.max(0, height));
    }
  }
  
  const smoothedHeightMap = [];
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    smoothedHeightMap[x] = [];
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      let sum = 0;
      let count = 0;
      
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= 0 && nx < CONFIG.WORLD_SIZE && nz >= 0 && nz < CONFIG.WORLD_SIZE) {
            sum += heightMap[nx][nz];
            count++;
          }
        }
      }
      
      smoothedHeightMap[x][z] = Math.floor(sum / count);
    }
  }
  
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      const height = smoothedHeightMap[x][z];
      
      for (let y = 0; y <= height; y++) {
        let blockType;
        
        if (y === height) {
          if (height === 0) {
            blockType = Math.random() > 0.5 ? 'dirt' : 'stone';
          } else {
            blockType = 'grass';
          }
        } else if (y >= height - 2) {
          blockType = 'dirt';
        } else {
          blockType = 'stone';
        }
        
        placeBlock(x, y, z, blockType, false);
      }
    }
  }
  
  console.log('Mundo generado con ' + blocks.length + ' bloques');
  console.log('Biomas: Montañas, Colinas y Llanuras');
  
  document.getElementById('world-seed').textContent = Math.floor(worldSeed);
  updateBlockCount();
}

// ============================================================================
// FUNCIONES DE BLOQUES
// ============================================================================

function placeBlock(x, y, z, type, updateCount = true) {
  const existing = getBlockAt(x, y, z);
  if (existing) return;
  
  const material = blockMaterials[type].clone();
  const mesh = new THREE.Mesh(blockGeometry, material);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, type };
  
  scene.add(mesh);
  blocks.push(mesh);
  
  // Incrementar contador si es colocado por el jugador
  if (updateCount && gameStarted) {
    gameState.blocksPlaced++;
    sendEvent('block_placed', 1, { type, x, y, z });
  }
  
  if (updateCount) updateBlockCount();
}

function removeBlock(block) {
  const index = blocks.indexOf(block);
  if (index > -1) {
    createItem(block.userData.x + 0.5, block.userData.y + 0.5, block.userData.z + 0.5, block.userData.type);
    blocks.splice(index, 1);
    scene.remove(block);
    
    // Incrementar contador de bloques destruidos
    if (gameStarted) {
      gameState.blocksDestroyed++;
      sendEvent('block_destroyed', 1, { type: block.userData.type });
    }
    
    updateBlockCount();
  }
}

// ============================================================================
// SISTEMA DE ITEMS
// ============================================================================

function createItem(x, y, z, type) {
  const itemGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const itemMaterial = new THREE.MeshLambertMaterial({ 
    color: BLOCK_TYPES[type].color,
    emissive: BLOCK_TYPES[type].color,
    emissiveIntensity: 0.3
  });
  
  const itemMesh = new THREE.Mesh(itemGeometry, itemMaterial);
  itemMesh.position.set(x, y, z);
  itemMesh.userData = { 
    type: type,
    createdAt: Date.now(),
    floatOffset: Math.random() * Math.PI * 2
  };
  
  scene.add(itemMesh);
  items.push(itemMesh);
}

function updateItems() {
  if (!player) return;
  
  const time = Date.now() * 0.001;
  
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    
    item.rotation.y += 0.05;
    item.position.y = item.userData.originalY || item.position.y;
    if (!item.userData.originalY) item.userData.originalY = item.position.y;
    item.position.y += Math.sin(time * 2 + item.userData.floatOffset) * 0.02;
    
    const distance = Math.sqrt(
      Math.pow(item.position.x - player.x, 2) +
      Math.pow(item.position.y - player.y, 2) +
      Math.pow(item.position.z - player.z, 2)
    );
    
    if (distance < 1.5) {
      collectItem(item, i);
    }
  }
}

function collectItem(item, index) {
  inventory[item.userData.type]++;
  updateInventoryUI();
  scene.remove(item);
  items.splice(index, 1);
}

function updateInventoryUI() {
  document.getElementById('inv-grass').textContent = inventory.grass;
  document.getElementById('inv-dirt').textContent = inventory.dirt;
  document.getElementById('inv-stone').textContent = inventory.stone;
}

function getBlockAt(x, y, z) {
  return blocks.find(b => 
    b.userData.x === x && 
    b.userData.y === y && 
    b.userData.z === z
  );
}

// ============================================================================
// CÁMARA
// ============================================================================

function updateCameraPosition() {
  const centerX = player ? player.x : CONFIG.WORLD_SIZE / 2;
  const centerZ = player ? player.z : CONFIG.WORLD_SIZE / 2;
  const centerY = player ? player.y : 0;
  
  const radians = (cameraAngle * Math.PI) / 180;
  const x = centerX + Math.cos(radians) * cameraDistance;
  const z = centerZ + Math.sin(radians) * cameraDistance;
  
  camera.position.set(x, centerY + CONFIG.CAMERA_HEIGHT, z);
  camera.lookAt(centerX, centerY, centerZ);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('wheel', onWheel);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  
  document.querySelectorAll('.block-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.block-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedBlockType = btn.dataset.type;
      document.getElementById('current-block').textContent = BLOCK_TYPES[selectedBlockType].name;
    });
  });
  
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('contextmenu', e => e.preventDefault());
}

function onMouseMove(event) {
  if (!gameStarted || !player) return;
  
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(blocks);
  
  if (hoveredBlock) {
    hoveredBlock.material.emissive.setHex(0x000000);
    hoveredBlock = null;
  }
  
  if (intersects.length > 0) {
    const targetBlock = intersects[0].object;
    const blockCenterX = targetBlock.userData.x + 0.5;
    const blockCenterY = targetBlock.userData.y + 0.5;
    const blockCenterZ = targetBlock.userData.z + 0.5;
    
    const distance = Math.sqrt(
      Math.pow(blockCenterX - player.x, 2) +
      Math.pow(blockCenterY - player.y, 2) +
      Math.pow(blockCenterZ - player.z, 2)
    );
    
    if (distance <= 4.5) {
      hoveredBlock = targetBlock;
      hoveredBlock.material.emissive.setHex(0x333333);
    }
  }
}

function onMouseDown(event) {
  if (!gameStarted || !player) return;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(blocks);
  
  if (intersects.length > 0) {
    const clickedBlock = intersects[0].object;
    const face = intersects[0].face;
    
    const blockCenterX = clickedBlock.userData.x + 0.5;
    const blockCenterY = clickedBlock.userData.y + 0.5;
    const blockCenterZ = clickedBlock.userData.z + 0.5;
    
    const distance = Math.sqrt(
      Math.pow(blockCenterX - player.x, 2) +
      Math.pow(blockCenterY - player.y, 2) +
      Math.pow(blockCenterZ - player.z, 2)
    );
    
    if (distance > 4.5) return;
    
    if (event.button === 0) {
      removeBlock(clickedBlock);
    } else if (event.button === 2) {
      event.preventDefault();
      
      let { x, y, z } = clickedBlock.userData;
      
      if (face.normal.x > 0) x++;
      else if (face.normal.x < 0) x--;
      else if (face.normal.y > 0) y++;
      else if (face.normal.y < 0) y--;
      else if (face.normal.z > 0) z++;
      else if (face.normal.z < 0) z--;
      
      if (x >= 0 && x < CONFIG.WORLD_SIZE && 
          z >= 0 && z < CONFIG.WORLD_SIZE && 
          y >= 0 && y < 10) {
        
        const playerBlockX = Math.floor(player.x);
        const playerBlockZ = Math.floor(player.z);
        const playerBlockY1 = Math.floor(player.y - CONFIG.PLAYER_HEIGHT / 2);
        const playerBlockY2 = Math.floor(player.y + CONFIG.PLAYER_HEIGHT / 2);
        
        if (!(x === playerBlockX && z === playerBlockZ && 
              (y === playerBlockY1 || y === playerBlockY2))) {
          placeBlock(x, y, z, selectedBlockType);
        }
      }
    }
  }
}

function onWheel(event) {
  if (!gameStarted) return;
  cameraDistance += event.deltaY * 0.01;
  cameraDistance = Math.max(15, Math.min(50, cameraDistance));
  updateCameraPosition();
}

function onKeyDown(event) {
  if (!gameStarted) return;
  
  switch(event.key.toLowerCase()) {
    case 'w': keys.w = true; break;
    case 'a': keys.a = true; break;
    case 's': keys.s = true; break;
    case 'd': keys.d = true; break;
    case ' ': keys.space = true; break;
  }
  
  switch(event.key) {
    case '1': document.querySelector('[data-type="grass"]').click(); break;
    case '2': document.querySelector('[data-type="dirt"]').click(); break;
    case '3': document.querySelector('[data-type="stone"]').click(); break;
    case 'q': case 'Q':
      cameraAngle -= CONFIG.ROTATION_SPEED;
      updateCameraPosition();
      break;
    case 'e': case 'E':
      cameraAngle += CONFIG.ROTATION_SPEED;
      updateCameraPosition();
      break;
  }
}

function onKeyUp(event) {
  if (!gameStarted) return;
  
  switch(event.key.toLowerCase()) {
    case 'w': keys.w = false; break;
    case 'a': keys.a = false; break;
    case 's': keys.s = false; break;
    case 'd': keys.d = false; break;
    case ' ': keys.space = false; break;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// FÍSICA Y MOVIMIENTO
// ============================================================================

function updatePlayer(deltaTime) {
  if (!player) return;
  
  const radians = (cameraAngle * Math.PI) / 180;
  let moveX = 0;
  let moveZ = 0;
  
  if (keys.w) {
    moveX -= Math.cos(radians) * CONFIG.PLAYER_SPEED;
    moveZ -= Math.sin(radians) * CONFIG.PLAYER_SPEED;
  }
  if (keys.s) {
    moveX += Math.cos(radians) * CONFIG.PLAYER_SPEED;
    moveZ += Math.sin(radians) * CONFIG.PLAYER_SPEED;
  }
  if (keys.a) {
    moveX += Math.cos(radians + Math.PI/2) * CONFIG.PLAYER_SPEED;
    moveZ += Math.sin(radians + Math.PI/2) * CONFIG.PLAYER_SPEED;
  }
  if (keys.d) {
    moveX -= Math.cos(radians + Math.PI/2) * CONFIG.PLAYER_SPEED;
    moveZ -= Math.sin(radians + Math.PI/2) * CONFIG.PLAYER_SPEED;
  }
  
  const newX = player.x + moveX;
  const newZ = player.z + moveZ;
  
  if (!checkCollision(newX, player.y, player.z)) {
    player.x = newX;
  }
  
  if (!checkCollision(player.x, player.y, newZ)) {
    player.z = newZ;
  }
  
  player.x = Math.max(0.5, Math.min(CONFIG.WORLD_SIZE - 0.5, player.x));
  player.z = Math.max(0.5, Math.min(CONFIG.WORLD_SIZE - 0.5, player.z));
  
  player.velocity.y -= 0.02;
  player.y += player.velocity.y;
  
  const groundY = getGroundHeight(player.x, player.z) + CONFIG.PLAYER_HEIGHT / 2;
  if (player.y <= groundY) {
    player.y = groundY;
    player.velocity.y = 0;
    player.onGround = true;
    
    if (keys.space) {
      player.velocity.y = 0.25;
      player.onGround = false;
    }
  } else {
    player.onGround = false;
  }
  
  playerMesh.position.set(player.x, player.y, player.z);
  
  if (moveX !== 0 || moveZ !== 0) {
    const targetAngle = Math.atan2(moveX, moveZ);
    playerMesh.rotation.y = targetAngle;
  }
  
  const currentLayer = Math.floor(getGroundHeight(player.x, player.z));
  document.getElementById('player-layer').textContent = currentLayer;
  
  updateCameraPosition();
}

function checkCollision(x, y, z) {
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  
  const currentGroundHeight = getGroundHeight(player.x, player.z);
  const targetGroundHeight = getGroundHeight(x, z);
  const heightDifference = targetGroundHeight - currentGroundHeight;
  
  if (heightDifference > 1) return true;
  if (heightDifference === 1 && player.onGround) return true;
  
  const feetY = y - CONFIG.PLAYER_HEIGHT / 2;
  const blockAtFeetLevel = Math.floor(feetY);
  
  if (blockAtFeetLevel > currentGroundHeight) {
    const blockInTheWay = getBlockAt(blockX, blockAtFeetLevel, blockZ);
    if (blockInTheWay) return true;
  }
  
  const headY = y + CONFIG.PLAYER_HEIGHT / 2;
  const blockAtHead = Math.floor(headY);
  const ceilingBlock = getBlockAt(blockX, blockAtHead, blockZ);
  
  if (ceilingBlock && blockAtHead > targetGroundHeight) return true;
  
  return false;
}

function getGroundHeight(x, z) {
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  
  for (let y = 10; y >= 0; y--) {
    const block = getBlockAt(blockX, y, blockZ);
    if (block) return y + 1;
  }
  return 0;
}

// ============================================================================
// GAME LOOP
// ============================================================================

function animate() {
  requestAnimationFrame(animate);
  
  if (!gameStarted) return;
  
  updatePlayer();
  updateItems();
  
  frames++;
  const currentTime = Date.now();
  if (currentTime >= lastTime + 1000) {
    document.getElementById('fps').textContent = frames;
    frames = 0;
    lastTime = currentTime;
  }
  
  renderer.render(scene, camera);
}

// ============================================================================
// UTILIDADES
// ============================================================================

function updateBlockCount() {
  document.getElementById('block-count').textContent = blocks.length;
}

async function startGame() {
  const name = playerNameInput.value.trim();
  if (name.length < 3) {
    alert('El nombre debe tener al menos 3 caracteres');
    playerNameInput.focus();
    return;
  }

  try {
    // Registrar jugador
    const player = await registerPlayer(name);
    gameState.playerId = player.id;
    gameState.playerName = name;
    
    // Iniciar sesión
    gameState.sessionId = await startSession(gameState.playerId);
    gameState.startTime = Date.now();
    gameState.blocksPlaced = 0;
    gameState.blocksDestroyed = 0;
    
    console.log('✅ Jugador registrado:', player);
    console.log('✅ Sesión iniciada:', gameState.sessionId);
    
    // Actualizar display del nombre
    document.getElementById('player-name-display').textContent = name;
    
    // Iniciar juego
    document.getElementById('welcome-screen').classList.add('hidden');
    gameStarted = true;
    updateInventoryUI();
    
    sendEvent('game_started', 1, { player: name, seed: Math.floor(worldSeed) });
    
  } catch (error) {
    console.error('Error al iniciar:', error);
    alert('No se pudo iniciar la partida: ' + error.message);
  }
}

// Event listener para el botón de inicio
startBtn.addEventListener('click', () => {
  startGame();
});

// Finalizar sesión al cerrar la página
window.addEventListener('beforeunload', () => {
  endSession();
});

// Inicializar cuando se carga la página
window.addEventListener('load', init);
