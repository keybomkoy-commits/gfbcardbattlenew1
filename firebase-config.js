// Firebase Config and Auth/Firestore Abstraction Layer
// Supports real Firebase online mode and local Mock offline mode fallback.
import { getStartingThaiSquad } from './game-engine.js';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, limit
} from 'firebase/firestore';

// ==========================================
// 🔑 FIREBASE WEB SDK CONFIGURATION
// ==========================================
// Paste your Firebase Config credentials object here.
// Leaving it empty or with empty strings will automatically fallback to Offline Mock Mode.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBL_UzJqlNryQaKY5-RBFqIyJEnuR0fhko",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gfbcardbattle.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gfbcardbattle",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gfbcardbattle.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "371211374933",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:371211374933:web:f5835215681297e4e39fdc"
};

// ==========================================
// 🛡️ SECURE ALLOWED ADMIN EMAIL DIRECTORY
// ==========================================
// Specify the exact email addresses allowed to hold the Administrator role.
// Any other emails not registered in this array will remain standard users.
const ALLOWED_ADMIN_EMAILS = [
  "admin@game.com",
  "superadmin@gfb.com"
];

let app = null;
let auth = null;
let db = null;
let isOnline = false;

const firebaseSDK = {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, limit
};

function initFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.log("No Firebase config. Running in OFFLINE mode.");
    return false;
  }
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isOnline = true;
    console.log("Firebase initialized successfully. Running in ONLINE mode.");
    
    // Auto-create secure admin credentials if not existing on Firestore/Auth
    setTimeout(() => {
      ensureOnlineAdminAccount();
      testFirestoreConnection();
    }, 1000);

    return true;
  } catch (err) {
    console.error("Failed to initialize Firebase online. Falling back to OFFLINE mode.", err);
    isOnline = false;
    return false;
  }
}

export async function testFirestoreConnection() {
  if (!isOnline) return;
  try {
    const testRef = firebaseSDK.doc(db, 'system_status', 'connectivity_test');
    await firebaseSDK.setDoc(testRef, {
      lastChecked: Date.now(),
      status: 'active'
    });
    console.log("Firestore test write succeeded. Database is ONLINE and writable!");
  } catch (err) {
    console.error("Firestore test write failed. Security rules or Database not created!", err);
    window.firestoreErrorAlert = err.message;
  }
}

async function ensureOnlineAdminAccount() {
  if (!isOnline) return;
  const adminEmail = "superadmin@gfb.com";
  const adminPassword = "superadmin1234";
  
  try {
    const cred = await firebaseSDK.createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    const defaultSquadData = getStartingThaiSquad();
    const userData = {
      uid: cred.user.uid,
      username: 'Super Admin',
      email: adminEmail,
      role: 'admin',
      coins: 99999,
      stats: { wins: 0, losses: 0, draws: 0 },
      inventory: defaultSquadData.inventory,
      squad: defaultSquadData.squad
    };
    await firebaseSDK.setDoc(firebaseSDK.doc(db, 'users', cred.user.uid), userData);
    console.log("Secure Online Admin account created successfully.");
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log("Secure Online Admin account already whitelisted and active.");
    } else {
      console.error("Error ensuring online admin account:", err);
    }
  }
}

// Call initialization immediately
initFirebase();

export const initPromise = Promise.resolve(true);

export function isFirebaseOnline() {
  return isOnline;
}

export async function isIpBanned(ip) {
  if (!ip) return false;
  if (isOnline) {
    try {
      const docId = ip.replace(/\./g, '-');
      const docSnap = await firebaseSDK.getDoc(firebaseSDK.doc(db, 'banned_ips', docId));
      return docSnap.exists();
    } catch (e) {
      console.error("Error checking IP ban online:", e);
      return false;
    }
  } else {
    const list = MOCK_DB.getBannedIps();
    return list.includes(ip);
  }
}

export async function banIpAddress(ip, reason = "Banned by Administrator") {
  if (!ip) return;
  if (isOnline) {
    const docId = ip.replace(/\./g, '-');
    await firebaseSDK.setDoc(firebaseSDK.doc(db, 'banned_ips', docId), {
      ip: ip,
      reason: reason,
      timestamp: Date.now()
    });
  } else {
    const list = MOCK_DB.getBannedIps();
    if (!list.includes(ip)) {
      list.push(ip);
      MOCK_DB.saveBannedIps(list);
    }
  }
}

export async function unbanIpAddress(ip) {
  if (!ip) return;
  if (isOnline) {
    const docId = ip.replace(/\./g, '-');
    await firebaseSDK.deleteDoc(firebaseSDK.doc(db, 'banned_ips', docId));
  } else {
    let list = MOCK_DB.getBannedIps();
    list = list.filter(x => x !== ip);
    MOCK_DB.saveBannedIps(list);
  }
}

// --- OFFLINE / MOCK SIMULATORS ---
// Stores offline data in localStorage
const MOCK_DB = {
  getUsers: () => JSON.parse(localStorage.getItem('offline_users') || '[]'),
  saveUsers: (users) => localStorage.setItem('offline_users', JSON.stringify(users)),
  getMatches: () => JSON.parse(localStorage.getItem('offline_matches') || '{}'),
  saveMatches: (matches) => localStorage.setItem('offline_matches', JSON.stringify(matches)),
  getPacks: () => JSON.parse(localStorage.getItem('offline_packs') || '[]'),
  savePacks: (packs) => localStorage.setItem('offline_packs', JSON.stringify(packs)),
  getBannedIps: () => JSON.parse(localStorage.getItem('offline_banned_ips') || '[]'),
  saveBannedIps: (ips) => localStorage.setItem('offline_banned_ips', JSON.stringify(ips))
};

// Seed default Gacha packs if empty in mock DB
if (MOCK_DB.getPacks().length === 0) {
  const defaultPacks = [
    { id: 'gold', name: 'Gold Pack', cost: 500, icon: 'fa-gift', desc: 'Standard odds (Legendary 5%, Epic 15%)', rates: { legendary: 5, epic: 15, rare: 30, common: 50 } },
    { id: 'legendary', name: 'Legend Pack', cost: 1500, icon: 'fa-chess-king', desc: 'Premium odds (Legendary 50%, Epic 40%)', rates: { legendary: 50, epic: 40, rare: 10, common: 0 } },
    { id: 'thai_national', name: 'Thai National Pack', cost: 800, icon: 'fa-flag', desc: 'Priority for Thai National players (Epic 60%, Rare 40%)', rates: { legendary: 0, epic: 60, rare: 40, common: 0 } }
  ];
  MOCK_DB.savePacks(defaultPacks);
}

// Self-healing check: reset mock DB if it uses outdated templates
const currentUsers = MOCK_DB.getUsers();
const hasOutdated = currentUsers.some(u => u.inventory && u.inventory.some(card => card.id === 'rashford_init' || card.templateId === 'messi')); // messi template changed to epic in some places
if (currentUsers.length === 0 || hasOutdated) {
  localStorage.removeItem('offline_session');
  localStorage.removeItem('offline_users');
  
  const adminStarting = getStartingThaiSquad();
  const userStarting = getStartingThaiSquad();

  const initialUsers = [
    {
      uid: 'offline_admin',
      username: 'System Admin',
      email: 'admin@game.com',
      password: 'admin', // plain for mock only
      role: 'admin',
      coins: 99999,
      stats: { wins: 10, losses: 2, draws: 3 },
      inventory: adminStarting.inventory,
      squad: adminStarting.squad
    },
    {
      uid: 'offline_user',
      username: 'Guest Player',
      email: 'player@game.com',
      password: 'player',
      role: 'user',
      coins: 2000,
      stats: { wins: 0, losses: 0, draws: 0 },
      inventory: userStarting.inventory,
      squad: userStarting.squad
    }
  ];
  MOCK_DB.saveUsers(initialUsers);
}

// --- AUTHENTICATION API ---

let mockAuthListener = null;
let currentMockUser = JSON.parse(localStorage.getItem('offline_session') || 'null');

export function onAuthChange(callback) {
  if (isOnline) {
    firebaseSDK.onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const data = await getUserData(firebaseUser.uid);
          if (!data) {
            await firebaseSDK.signOut(auth);
            callback(null);
          } else {
            // Enforce memory admin role based on whitelist
            if (ALLOWED_ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase())) {
              data.role = 'admin';
            }
            callback({ ...data, uid: firebaseUser.uid });
          }
        } catch (err) {
          console.error("Auth state recovery error:", err);
          try {
            await firebaseSDK.signOut(auth);
          } catch (e) {}
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  } else {
    mockAuthListener = callback;
    // Trigger immediately with current session
    setTimeout(() => {
      if (currentMockUser) {
        const users = MOCK_DB.getUsers();
        const freshUser = users.find(u => u.uid === currentMockUser.uid);
        if (freshUser) {
          if (ALLOWED_ADMIN_EMAILS.includes(freshUser.email?.toLowerCase())) {
            freshUser.role = 'admin';
          }
        }
        callback(freshUser || null);
      } else {
        callback(null);
      }
    }, 50);
  }
}

export async function signUp(email, password, username, currentIp) {
  // Check IP ban first
  if (currentIp && await isIpBanned(currentIp)) {
    throw new Error("IP ของคุณถูกระงับการใช้งานถาวร ไม่สามารถสร้างบัญชีผู้ใช้งานใหม่ได้");
  }

  const defaultSquadData = getStartingThaiSquad();
  if (isOnline) {
    // 1. Create Auth User
    const cred = await firebaseSDK.createUserWithEmailAndPassword(auth, email, password);
    // 2. Create User doc in Firestore
    const userData = {
      uid: cred.user.uid,
      username: username,
      email: email,
      role: ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user',
      coins: 2000,
      stats: { wins: 0, losses: 0, draws: 0 },
      inventory: defaultSquadData.inventory,
      squad: defaultSquadData.squad,
      lastIp: currentIp || "",
      banStatus: 'none'
    };
    await firebaseSDK.setDoc(firebaseSDK.doc(db, 'users', cred.user.uid), userData);
    return userData;
  } else {
    const users = MOCK_DB.getUsers();
    if (users.find(u => u.email === email)) {
      throw new Error("Email already registered offline.");
    }
    const newUser = {
      uid: 'mock_' + Math.random().toString(36).substr(2, 9),
      username,
      email,
      password,
      role: ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user',
      coins: 2000,
      stats: { wins: 0, losses: 0, draws: 0 },
      inventory: defaultSquadData.inventory,
      squad: defaultSquadData.squad,
      lastIp: currentIp || "",
      banStatus: 'none'
    };
    users.push(newUser);
    MOCK_DB.saveUsers(users);
    currentMockUser = newUser;
    localStorage.setItem('offline_session', JSON.stringify(newUser));
    if (mockAuthListener) mockAuthListener(newUser);
    return newUser;
  }
}

export async function logIn(email, password, currentIp) {
  // Check IP ban first
  if (currentIp && await isIpBanned(currentIp)) {
    throw new Error("IP ของคุณถูกระงับการใช้งาน ไม่สามารถเข้าสู่ระบบได้");
  }

  if (isOnline) {
    const cred = await firebaseSDK.signInWithEmailAndPassword(auth, email, password);
    let userData = await getUserData(cred.user.uid);
    if (!userData) {
      if (ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase())) {
        const defaultSquadData = getStartingThaiSquad();
        userData = {
          uid: cred.user.uid,
          username: 'Super Admin',
          email: email,
          role: 'admin',
          coins: 99999,
          stats: { wins: 0, losses: 0, draws: 0 },
          inventory: defaultSquadData.inventory,
          squad: defaultSquadData.squad,
          lastIp: currentIp || "",
          banStatus: 'none'
        };
        await firebaseSDK.setDoc(firebaseSDK.doc(db, 'users', cred.user.uid), userData);
        console.log("Whitelisted admin Firestore document self-healed and created.");
      } else {
        await firebaseSDK.signOut(auth);
        throw new Error("บัญชีนี้ถูกลบโดยผู้ดูแลระบบแล้ว");
      }
    }

    // Check ban status
    if (userData.banStatus === 'banned') {
      await firebaseSDK.signOut(auth);
      throw new Error("บัญชีนี้ถูกระงับการใช้งานโดยผู้ดูแลระบบ");
    }
    if (userData.banStatus === 'ip_banned') {
      const userIp = userData.lastIp || currentIp;
      if (userIp) await banIpAddress(userIp, "Linked account IP Banned");
      await firebaseSDK.signOut(auth);
      throw new Error("บัญชีและ IP นี้ถูกระงับการใช้งานถาวร");
    }

    const updates = {};
    if (currentIp) updates.lastIp = currentIp;
    if (ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase()) && userData.role !== 'admin') {
      updates.role = 'admin';
      userData.role = 'admin';
    }

    if (Object.keys(updates).length > 0) {
      try {
        await firebaseSDK.updateDoc(firebaseSDK.doc(db, 'users', cred.user.uid), updates);
      } catch (err) {
        console.warn("Non-blocking login metadata save error:", err);
      }
    }
    if (currentIp) userData.lastIp = currentIp;

    return userData;
  } else {
    const users = MOCK_DB.getUsers();
    let user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      throw new Error("Invalid credentials in offline database.");
    }

    if (user.banStatus === 'banned') {
      throw new Error("บัญชีนี้ถูกระงับการใช้งานโดยผู้ดูแลระบบ");
    }
    if (user.banStatus === 'ip_banned') {
      const userIp = user.lastIp || currentIp;
      if (userIp) await banIpAddress(userIp, "Linked account IP Banned");
      throw new Error("บัญชีและ IP นี้ถูกระงับการใช้งานถาวร");
    }

    if (currentIp) user.lastIp = currentIp;
    if (ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase()) && user.role !== 'admin') {
      user.role = 'admin';
    }

    const idx = users.findIndex(u => u.uid === user.uid);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...user };
      MOCK_DB.saveUsers(users);
    }

    currentMockUser = user;
    localStorage.setItem('offline_session', JSON.stringify(user));
    if (mockAuthListener) mockAuthListener(user);
    return user;
  }
}

export async function logOut() {
  if (isOnline) {
    await firebaseSDK.signOut(auth);
  } else {
    currentMockUser = null;
    localStorage.removeItem('offline_session');
    if (mockAuthListener) mockAuthListener(null);
  }
}

// --- FIRESTORE USER PROFILES ---

export async function getUserData(uid) {
  if (isOnline) {
    try {
      const docSnap = await firebaseSDK.getDoc(firebaseSDK.doc(db, 'users', uid));
      return docSnap.exists() ? docSnap.data() : null;
    } catch (err) {
      console.error("getUserData Firestore error:", err);
      throw new Error(err.message + " (กรุณาตรวจสอบว่าได้คลิก 'Create Database' ในหัวข้อ Cloud Firestore บน Firebase Console และตั้งค่า Rules เรียบร้อยแล้ว)");
    }
  } else {
    const users = MOCK_DB.getUsers();
    return users.find(u => u.uid === uid) || null;
  }
}

export async function saveUserData(uid, data) {
  if (isOnline) {
    try {
      await firebaseSDK.setDoc(firebaseSDK.doc(db, 'users', uid), data, { merge: true });
    } catch (err) {
      console.error("saveUserData Firestore error:", err);
      throw new Error(err.message + " (ไม่สามารถบันทึกข้อมูลได้ เนื่องจากฐานข้อมูลถูกล็อกหรือกฎ Rules ผิดพลาด)");
    }
  } else {
    const users = MOCK_DB.getUsers();
    const idx = users.findIndex(u => u.uid === uid);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...data };
      MOCK_DB.saveUsers(users);
      if (currentMockUser && currentMockUser.uid === uid) {
        currentMockUser = users[idx];
        localStorage.setItem('offline_session', JSON.stringify(users[idx]));
      }
    }
  }
}

// --- MATCHMAKING & REAL-TIME MATCH LOGIC ---

let mockMatchListeners = {};
let mockMatchState = null; // single active room simulation for offline bot mode

export async function createMatchRoom(roomCode, matchData) {
  if (isOnline) {
    await firebaseSDK.setDoc(firebaseSDK.doc(db, 'matches', roomCode), matchData);
  } else {
    const matches = MOCK_DB.getMatches();
    matches[roomCode] = matchData;
    MOCK_DB.saveMatches(matches);
    mockMatchState = matchData;
    triggerMockListeners(roomCode, matchData);
  }
}

export async function updateMatchRoom(roomCode, updates) {
  if (isOnline) {
    await firebaseSDK.updateDoc(firebaseSDK.doc(db, 'matches', roomCode), updates);
  } else {
    const matches = MOCK_DB.getMatches();
    if (matches[roomCode]) {
      matches[roomCode] = { ...matches[roomCode], ...updates };
      MOCK_DB.saveMatches(matches);
      mockMatchState = matches[roomCode];
      triggerMockListeners(roomCode, matches[roomCode]);
    }
  }
}

export async function getMatchRoom(roomCode) {
  if (isOnline) {
    const docSnap = await firebaseSDK.getDoc(firebaseSDK.doc(db, 'matches', roomCode));
    return docSnap.exists() ? docSnap.data() : null;
  } else {
    const matches = MOCK_DB.getMatches();
    return matches[roomCode] || null;
  }
}

export function subscribeToMatch(roomCode, callback) {
  if (isOnline) {
    return firebaseSDK.onSnapshot(firebaseSDK.doc(db, 'matches', roomCode), (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      } else {
        callback(null);
      }
    });
  } else {
    if (!mockMatchListeners[roomCode]) {
      mockMatchListeners[roomCode] = [];
    }
    mockMatchListeners[roomCode].push(callback);

    // Initial trigger
    const matches = MOCK_DB.getMatches();
    setTimeout(() => callback(matches[roomCode] || null), 20);

    // Unsubscribe helper
    return () => {
      mockMatchListeners[roomCode] = mockMatchListeners[roomCode].filter(cb => cb !== callback);
    };
  }
}

function triggerMockListeners(roomCode, data) {
  if (mockMatchListeners[roomCode]) {
    mockMatchListeners[roomCode].forEach(cb => cb(data));
  }
}

export async function deleteMatchRoom(roomCode) {
  if (isOnline) {
    await firebaseSDK.deleteDoc(firebaseSDK.doc(db, 'matches', roomCode));
  } else {
    const matches = MOCK_DB.getMatches();
    delete matches[roomCode];
    MOCK_DB.saveMatches(matches);
    triggerMockListeners(roomCode, null);
  }
}

export async function searchOpenMatches() {
  if (isOnline) {
    const q = firebaseSDK.query(
      firebaseSDK.collection(db, 'matches'),
      firebaseSDK.where('status', '==', 'waiting'),
      firebaseSDK.where('type', '==', '1v1'),
      firebaseSDK.limit(10)
    );
    const snap = await firebaseSDK.getDocs(q);
    const rooms = [];
    snap.forEach(docSnap => rooms.push(docSnap.data()));
    return rooms;
  } else {
    const matches = MOCK_DB.getMatches();
    return Object.values(matches).filter(m => m.status === 'waiting' && m.type === '1v1');
  }
}

// --- ADMIN API ---

export async function getAllUsers() {
  if (isOnline) {
    const q = firebaseSDK.query(firebaseSDK.collection(db, 'users'), firebaseSDK.limit(100));
    const snap = await firebaseSDK.getDocs(q);
    const list = [];
    snap.forEach(d => list.push(d.data()));
    return list;
  } else {
    return MOCK_DB.getUsers();
  }
}

export async function updateUserByAdmin(uid, updates) {
  if (isOnline) {
    const userDocRef = firebaseSDK.doc(db, 'users', uid);
    
    // Auth password update requires admin to reset via standard API if needed, 
    // but in a client-side environment, we can't easily force Auth password resets without the user log-in.
    // However, we can store it or update their user doc. If password field is present, we handle it.
    await firebaseSDK.updateDoc(userDocRef, updates);
  } else {
    const users = MOCK_DB.getUsers();
    const idx = users.findIndex(u => u.uid === uid);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates };
      MOCK_DB.saveUsers(users);
      if (currentMockUser && currentMockUser.uid === uid) {
        currentMockUser = users[idx];
        localStorage.setItem('offline_session', JSON.stringify(users[idx]));
      }
    }
  }
}

export async function deleteUserByAdmin(uid) {
  if (isOnline) {
    await firebaseSDK.deleteDoc(firebaseSDK.doc(db, 'users', uid));
    // Firebase Auth user cannot be deleted directly from client-side Firestore rules,
    // but clearing their data disables their record in matches/leaderboard.
  } else {
    let users = MOCK_DB.getUsers();
    users = users.filter(u => u.uid !== uid);
    MOCK_DB.saveUsers(users);
    if (currentMockUser && currentMockUser.uid === uid) {
      currentMockUser = null;
      localStorage.removeItem('offline_session');
    }
  }
}

export async function getActiveMatches() {
  if (isOnline) {
    const q = firebaseSDK.query(firebaseSDK.collection(db, 'matches'), firebaseSDK.limit(50));
    const snap = await firebaseSDK.getDocs(q);
    const rooms = [];
    snap.forEach(d => rooms.push(d.data()));
    return rooms;
  } else {
    return Object.values(MOCK_DB.getMatches());
  }
}

// Gacha Packs database access functions
export async function getGachaPacks() {
  if (isOnline) {
    const q = firebaseSDK.query(firebaseSDK.collection(db, 'gacha_packs'), firebaseSDK.limit(50));
    const snap = await firebaseSDK.getDocs(q);
    const list = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id }));
    return list;
  } else {
    return MOCK_DB.getPacks();
  }
}

export async function addGachaPack(pack) {
  if (isOnline) {
    const docRef = firebaseSDK.doc(firebaseSDK.collection(db, 'gacha_packs'));
    await firebaseSDK.setDoc(docRef, { ...pack, id: docRef.id });
  } else {
    const packs = MOCK_DB.getPacks();
    packs.push(pack);
    MOCK_DB.savePacks(packs);
  }
}

export async function updateGachaPack(id, pack) {
  if (isOnline) {
    await firebaseSDK.updateDoc(firebaseSDK.doc(db, 'gacha_packs', id), pack);
  } else {
    const packs = MOCK_DB.getPacks();
    const idx = packs.findIndex(p => p.id === id);
    if (idx !== -1) {
      packs[idx] = { ...packs[idx], ...pack };
      MOCK_DB.savePacks(packs);
    }
  }
}

export async function deleteGachaPack(id) {
  if (isOnline) {
    await firebaseSDK.deleteDoc(firebaseSDK.doc(db, 'gacha_packs', id));
  } else {
    let packs = MOCK_DB.getPacks();
    packs = packs.filter(p => p.id !== id);
    MOCK_DB.savePacks(packs);
  }
}
