// ===== SERVICE WORKER - FITLAND MOKNINE =====
// Web Push natif + Supabase Edge Function

// ===== RECEPTION DES PUSH WEB =====
self.addEventListener('push', e => {
  console.log('[SW] Push reçu:', e);
  const data = e.data ? e.data.json() : {};
  const title = data.title || '💪 Fitland';
  const body = data.body || '';
  const tag = data.tag || 'fitland-' + Date.now();
  const requireInteraction = data.requireInteraction || false;
  
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      requireInteraction,
      vibrate: [200, 100, 200],
      data
    })
  );
});

const CACHE_NAME = 'fitland-v1';

// Planning des cours par jour (0=dim, 1=lun, ..., 6=sam)
const PLANNING = {
  1: [ // Lundi
    {heure:'09h00', nom:'BFC', coach:'Khawla', type:'apres-midi'},
    {heure:'15h00', nom:'Circuit Minceur', coach:'Amal', type:'apres-midi'},
    {heure:'17h30', nom:'Danse Orientale', coach:'Tayssir / Marwa', type:'apres-midi'},
    {heure:'18h30', nom:'Step 1+ / LIA', coach:'Marwa', type:'apres-midi'}
  ],
  2: [ // Mardi
    {heure:'09h00', nom:'Morning Fitness Floor', coach:'Marwa', type:'matin'},
    {heure:'16h30', nom:'Cardio Mix', coach:'Mariem', type:'apres-midi'},
    {heure:'17h30', nom:'Pymp / TRX', coach:'Amina', type:'apres-midi'},
    {heure:'18h30', nom:'Pilates', coach:'Marwa / Amina', type:'apres-midi'}
  ],
  3: [ // Mercredi
    {heure:'09h00', nom:'Aéro Bande Élastique', coach:'Najla', type:'matin'},
    {heure:'15h00', nom:'C.A.F', coach:'Amal', type:'apres-midi'},
    {heure:'18h00', nom:'Cardio Mix / Strong', coach:'Marwa', type:'apres-midi'},
    {heure:'19h00', nom:'Cycling', coach:'Souzane', type:'apres-midi'}
  ],
  4: [ // Jeudi
    {heure:'09h00', nom:'Pilates', coach:'Amina', type:'matin'},
    {heure:'17h30', nom:'Step 1', coach:'Mariem', type:'apres-midi'},
    {heure:'18h30', nom:'Combat', coach:'Amal', type:'apres-midi'}
  ],
  5: [ // Vendredi
    {heure:'09h00', nom:'Fullbody Workout', coach:'Yosra', type:'matin'},
    {heure:'15h00', nom:'Tabata', coach:'Amal', type:'apres-midi'},
    {heure:'16h30', nom:'C.A.F', coach:'Amina', type:'apres-midi'},
    {heure:'17h30', nom:'BFC', coach:'Khawla', type:'apres-midi'},
    {heure:'18h30', nom:'Zumba / iChoreo', coach:'Marwa', type:'apres-midi'}
  ],
  6: [ // Samedi
    {heure:'10h-11h', nom:'APA Femmes Enceintes', coach:'', type:'matin'},
    {heure:'11h00', nom:'APA', coach:'', type:'matin'},
    {heure:'13h30', nom:'Karaté Kids', coach:'', type:'apres-midi'},
    {heure:'15h-16h', nom:'Psychomotricité', coach:'', type:'apres-midi'},
    {heure:'16h-17h30', nom:'Gymnastique', coach:'', type:'apres-midi'}
  ],
  0: [ // Dimanche
    {heure:'09h30', nom:'Psychomotricité', coach:'', type:'matin'},
    {heure:'10h30', nom:'Dance (Kids)', coach:'', type:'matin'},
    {heure:'11h30', nom:'Gymnastique', coach:'', type:'matin'},
    {heure:'13h30', nom:'Karaté Kids', coach:'', type:'apres-midi'}
  ]
};

// Messages de motivation FR + AR (change chaque jour)
const MESSAGES = [
  {fr: "La douleur d'aujourd'hui est la force de demain", ar: "ألم اليوم قوة الغد"},
  {fr: "Chaque effort compte, même le plus petit", ar: "كل جهد يحسب، حتى الأصغر"},
  {fr: "Ton seul concurrent c'est toi d'hier", ar: "منافسك الوحيد هو أنت بالأمس"},
  {fr: "Le corps accomplit ce que l'esprit croit", ar: "الجسم ينجز ما يؤمن به العقل"},
  {fr: "Sois plus fort que tes excuses", ar: "كن أقوى من أعذارك"},
  {fr: "La régularité est la clé du succès", ar: "الاستمرارية هي مفتاح النجاح"},
  {fr: "Dépasse tes limites, découvre ton potentiel", ar: "تجاوز حدودك، اكتشف إمكانياتك"}
];

// ===== LOGIQUE DE NOTIFICATIONS =====
// On n'utilise PAS setTimeout (tués par Android/iOS en arrière-plan)
// On utilise : periodicsync, sync, fetch event, et vérification au réveil

// ---- Install ----
self.addEventListener('install', e => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

// ---- Activate ----
self.addEventListener('activate', e => {
  console.log('[SW] Activated');
  e.waitUntil(
    clients.claim().then(() => {
      // Vérifier les notifications dès l'activation
      return verifierEtEnvoyerNotifs();
    })
  );
});

// ---- Periodic Sync (Android Chrome, si supporté) ----
// Permet au SW de se réveiller périodiquement même app fermée
self.addEventListener('periodicsync', e => {
  console.log('[SW] Periodic sync:', e.tag);
  if(e.tag === 'fitland-notifs') {
    e.waitUntil(verifierEtEnvoyerNotifs());
  }
});

// ---- Background Sync (fallback) ----
self.addEventListener('sync', e => {
  console.log('[SW] Sync:', e.tag);
  if(e.tag === 'fitland-check-notifs') {
    e.waitUntil(verifierEtEnvoyerNotifs());
  }
});

// ---- Fetch event : profiter de chaque réveil réseau ----
self.addEventListener('fetch', e => {
  // On vérifie les notifs à chaque requête réseau (réveil du SW)
  verifierEtEnvoyerNotifs().catch(()=>{});
  // On laisse passer la requête normalement
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ---- Message depuis l'app ----
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SCHEDULE_NOTIFS') {
    const {aboType, notifCours, notifAbo, notifAnniv, aboStart, aboDur, dob, nom} = e.data;
    self.userData = {aboType, notifCours, notifAbo, notifAnniv, aboStart, aboDur, dob, nom};
    // Sauvegarder dans le cache pour persister entre les réveils
    sauvegarderUserData(self.userData);
    verifierEtEnvoyerNotifs();
  }
  if(e.data && e.data.type === 'TEST_NOTIF') {
    showTestNotif(e.data);
  }
});

// ---- Persistance des données utilisateur dans le cache ----
async function sauvegarderUserData(data) {
  try {
    const cache = await caches.open('fitland-userdata-v1');
    const response = new Response(JSON.stringify(data));
    await cache.put('/fitland-userdata', response);
  } catch(e) { console.warn('[SW] Sauvegarde userData échouée:', e); }
}

async function chargerUserData() {
  try {
    const cache = await caches.open('fitland-userdata-v1');
    const response = await cache.match('/fitland-userdata');
    if(response) {
      const data = await response.json();
      self.userData = data;
      return data;
    }
  } catch(e) { console.warn('[SW] Chargement userData échoué:', e); }
  return null;
}

// ---- Clé pour éviter les doublons : stocker les notifs déjà envoyées ----
async function getNotifsSentToday() {
  try {
    const cache = await caches.open('fitland-notifs-sent-v1');
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const response = await cache.match('/notifs-sent-' + today);
    if(response) return await response.json();
  } catch(e) {}
  return {};
}

async function marquerNotifEnvoyee(key) {
  try {
    const cache = await caches.open('fitland-notifs-sent-v1');
    const today = new Date().toISOString().slice(0, 10);
    const sent = await getNotifsSentToday();
    sent[key] = true;
    await cache.put('/notifs-sent-' + today, new Response(JSON.stringify(sent)));
    // Nettoyer les vieux jours (garder seulement aujourd'hui)
    const keys = await cache.keys();
    for(const req of keys) {
      if(!req.url.includes(today)) await cache.delete(req);
    }
  } catch(e) {}
}

// ---- Fonction principale : vérifier et envoyer les notifs ----
async function verifierEtEnvoyerNotifs() {
  // Charger les données si pas en mémoire
  if(!self.userData) {
    await chargerUserData();
  }
  const userData = self.userData;
  if(!userData) return; // Pas de profil configuré

  const now = new Date();
  const jourIndex = now.getDay();
  const heure = now.getHours();
  const minute = now.getMinutes();
  const totalMinutes = heure * 60 + minute;

  const sent = await getNotifsSentToday();

  // === 1. Notif cours du MATIN (7h30 → 8h30) ===
  if(userData.notifCours && !sent['cours-matin'] && totalMinutes >= 450 && totalMinutes < 510) {
    const envoyee = await envoyerNotifCours('matin', now, userData);
    if(envoyee) await marquerNotifEnvoyee('cours-matin');
  }

  // === 2. Notif cours de l'APRÈS-MIDI (14h00 → 15h00) ===
  if(userData.notifCours && !sent['cours-aprem'] && totalMinutes >= 840 && totalMinutes < 900) {
    const envoyee = await envoyerNotifCours('apres-midi', now, userData);
    if(envoyee) await marquerNotifEnvoyee('cours-aprem');
  }

  // === 3. Notif abonnement J-7 et J-3 (entre 9h et 10h) ===
  if(userData.notifAbo && userData.aboStart && userData.aboDur && !sent['abo'] && totalMinutes >= 540 && totalMinutes < 600) {
    await verifierAbonnement(userData);
    await marquerNotifEnvoyee('abo');
  }

  // === 4. Notif anniversaire (entre 9h et 10h) ===
  if(userData.notifAnniv && userData.dob && !sent['anniv'] && totalMinutes >= 540 && totalMinutes < 600) {
    await verifierAnniversaire(userData, now);
    await marquerNotifEnvoyee('anniv');
  }
}

// ---- Envoyer notif cours ----
async function envoyerNotifCours(session, date, userData) {
  const aboType = userData.aboType || 'acces-total';
  const jourIndex = date.getDay();
  const coursDuJour = PLANNING[jourIndex] || [];

  let coursFiltrés = coursDuJour;
  if(aboType === 'fitness') return false;
  else if(aboType === 'cours-matin') {
    coursFiltrés = coursDuJour.filter(c => c.type === 'matin');
    if(session === 'apres-midi') return false;
  } else if(aboType === 'cours-apres-midi') {
    coursFiltrés = coursDuJour.filter(c => c.type === 'apres-midi');
    if(session === 'matin') return false;
  }

  if(coursFiltrés.length === 0) return false;

  const msgIndex = date.getDay() % MESSAGES.length;
  const msg = MESSAGES[msgIndex];
  const titreSession = session === 'matin' ? 'Cours du matin 🌅' : "Cours de l'après-midi 🌞";
  const listeCours = coursFiltrés.map(c => `• ${c.heure} — ${c.nom}${c.coach ? ' (' + c.coach + ')' : ''}`).join('\n');
  const body = `"${msg.fr}"\n${msg.ar}\n\n📋 Tes cours :\n${listeCours}\n\nOn t'attend ! 💪`;

  await self.registration.showNotification(`💪 Fitland — ${titreSession}`, {
    body, icon: '/icon-192.png', badge: '/icon-192.png',
    tag: `cours-${session}`, renotify: true,
    requireInteraction: false, vibrate: [200, 100, 200]
  });
  return true;
}

// ---- Vérifier abonnement ----
async function verifierAbonnement(userData) {
  const now = new Date();
  const start = new Date(userData.aboStart);
  const end = new Date(start);
  end.setMonth(end.getMonth() + parseInt(userData.aboDur));

  const diffMs = end.getTime() - now.getTime();
  const diffJours = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if(diffJours === 7) {
    await self.registration.showNotification('⚠️ Abonnement — اشتراكك', {
      body: `اشتراكك ينتهي خلال 7 أيام — جدّد اليوم واستفد من تخفيض 10% 🎁\nVotre abonnement expire dans 7 jours — Renouvelez aujourd'hui !`,
      icon: '/icon-192.png', badge: '/icon-192.png',
      tag: 'abo-expire-7', requireInteraction: true, vibrate: [200, 100, 200]
    });
  } else if(diffJours === 3) {
    await self.registration.showNotification('🚨 Abonnement — اشتراكك', {
      body: `اشتراكك ينتهي خلال 3 أيام — جدّد الآن ! 🚨\nVotre abonnement expire dans 3 jours — Renouvelez maintenant !`,
      icon: '/icon-192.png', badge: '/icon-192.png',
      tag: 'abo-expire-3', requireInteraction: true, vibrate: [200, 100, 200]
    });
  }
}

// ---- Vérifier anniversaire ----
async function verifierAnniversaire(userData, now) {
  const dob = new Date(userData.dob);
  if(dob.getMonth() === now.getMonth() && dob.getDate() === now.getDate()) {
    const nom = userData.nom || 'Membre';
    const age = now.getFullYear() - dob.getFullYear();
    await self.registration.showNotification(`🎂 Joyeux anniversaire ${nom} ! — ميلاد سعيد !`, {
      body: `🎉 Joyeux anniversaire ${nom} !\nميلاد سعيد يا ${nom} ! 🎉\n\nتمنياتنا بالصحة والسعادة 💚\nL'équipe Fitland vous souhaite le meilleur !\n\n🎁 Cadeau spécial pour toi aujourd'hui :\nSi tu renouvelles ton abonnement aujourd'hui,\ntu bénéficies d'une remise de ${age} % !\n\n🎁 هدية خاصة ليوم ميلادك :\nإذا جدّدت اشتراكك اليوم،\nتستفيد من تخفيض ${age} % !`,
      icon: '/icon-192.png', badge: '/icon-192.png',
      tag: 'anniversaire', requireInteraction: true, vibrate: [200, 100, 200, 100, 200]
    });
  }
}

// ---- Fonction test : 5 notifications en séquence ----
function showTestNotif(data) {
  const reg = self.registration;
  const sendNotif = (title, body, tag, requireInteraction = false, delay = 0) => {
    setTimeout(() => {
      reg.showNotification(title, {
        body, icon: '/icon-192.png', badge: '/icon-192.png',
        tag: tag + '-' + Date.now(), renotify: false,
        requireInteraction, vibrate: [200, 100, 200]
      });
    }, delay);
  };

  sendNotif(
    '💪 Fitland — Cours du matin 🌅',
    "La douleur d'aujourd'hui est la force de demain\nألم اليوم قوة الغد\n\n📋 Tes cours :\n• 09h00 — Morning Fitness Floor (Marwa)\n• 09h00 — BFC (Khawla)\n\nOn t'attend ! 💪",
    'test-matin', false, 0
  );
  sendNotif(
    "💪 Fitland — Cours de l'après-midi 🌞",
    "Sois plus fort que tes excuses\nكن أقوى من أعذارك\n\n📋 Tes cours :\n• 17h30 — Danse Orientale (Tayssir / Marwa)\n• 18h30 — Step 1+ / LIA (Marwa)\n\nOn t'attend ! 💪",
    'test-aprem', false, 4000
  );
  sendNotif(
    '⚠️ Abonnement — اشتراكك',
    "اشتراكك ينتهي خلال 7 أيام — جدّد اليوم واستفد من تخفيض 10% 🎁\nVotre abonnement expire dans 7 jours — Renouvelez aujourd'hui !",
    'test-abo7', true, 8000
  );
  sendNotif(
    '🚨 Abonnement — اشتراكك',
    "اشتراكك ينتهي خلال 3 أيام — جدّد الآن ! 🚨\nVotre abonnement expire dans 3 jours — Renouvelez maintenant !",
    'test-abo3', true, 12000
  );
  const nom = (data && data.nom) ? data.nom : 'Membre';
  const age = (data && data.age) ? data.age : 30;
  sendNotif(
    `🎂 Joyeux anniversaire ${nom} ! — ميلاد سعيد !`,
    `🎉 Joyeux anniversaire ${nom} !\nميلاد سعيد يا ${nom} ! 🎉\n\nتمنياتنا بالصحة والسعادة 💚\nL'équipe Fitland vous souhaite le meilleur !\n\n🎁 Cadeau spécial pour toi aujourd'hui :\nSi tu renouvelles ton abonnement aujourd'hui,\ntu bénéficies d'une remise de ${age} % !\n\n🎁 هدية خاصة ليوم ميلادك :\nإذا جدّدت اشتراكك اليوم،\nتستفيد من تخفيض ${age} % !`,
    'test-anniv', true, 16000
  );
}

// ---- Clic sur notification ----
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      if(list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
