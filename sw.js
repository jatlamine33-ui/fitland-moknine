// ===== SERVICE WORKER - FITLAND MOKNINE =====
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

// Install - cache de base
self.addEventListener('install', e => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] Activated');
  e.waitUntil(clients.claim());
  // Planifier les notifications au démarrage
  scheduleNotifications();
});

// Message depuis l'app principale
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SCHEDULE_NOTIFS') {
    const {aboType, notifCours, notifAbo, notifAnniv, aboStart, aboDur, dob, nom} = e.data;
    // Stocker les préférences
    self.userData = {aboType, notifCours, notifAbo, notifAnniv, aboStart, aboDur, dob, nom};
    scheduleNotifications();
  }
  if(e.data && e.data.type === 'TEST_NOTIF') {
    showTestNotif(e.data);
  }
});

// Planifier toutes les notifications
function scheduleNotifications() {
  // Annuler les anciens timers si possible
  if(self._timerCours) clearTimeout(self._timerCours);
  if(self._timerAbo) clearTimeout(self._timerAbo);
  if(self._timerAnniv) clearTimeout(self._timerAnniv);

  const now = new Date();
  
  // Notification cours 07h30 (matin) - demain si déjà passé aujourd'hui
  planifierNotifCours(7, 30, 'matin', now);
  
  // Notification cours 14h00 (après-midi)
  planifierNotifCours(14, 0, 'apres-midi', now);
  
  // Vérifier abo et anniv chaque jour à 09h00
  planifierVerifQuotidienne(now);
}

function planifierNotifCours(heure, minute, session, now) {
  const cible = new Date(now);
  cible.setHours(heure, minute, 0, 0);
  
  // Si déjà passé aujourd'hui, viser demain
  if(cible <= now) {
    cible.setDate(cible.getDate() + 1);
  }
  
  const delai = cible.getTime() - now.getTime();
  
  const timer = setTimeout(() => {
    envoyerNotifCours(session, cible);
    // Re-planifier pour le lendemain
    const prochaine = new Date(cible);
    prochaine.setDate(prochaine.getDate() + 1);
    const delaiSuivant = prochaine.getTime() - new Date().getTime();
    setTimeout(() => planifierNotifCours(heure, minute, session, new Date()), delaiSuivant);
  }, delai);
  
  if(session === 'matin') self._timerCours = timer;
}

function planifierVerifQuotidienne(now) {
  const cible = new Date(now);
  cible.setHours(9, 0, 0, 0);
  if(cible <= now) cible.setDate(cible.getDate() + 1);
  
  const delai = cible.getTime() - now.getTime();
  self._timerAbo = setTimeout(() => {
    verifierAboEtAnniv();
    // Re-planifier pour demain
    planifierVerifQuotidienne(new Date());
  }, delai);
}

function envoyerNotifCours(session, date) {
  const userData = self.userData || {};
  if(!userData.notifCours) return; // désactivé
  
  const aboType = userData.aboType || 'acces-total';
  const jourIndex = date.getDay();
  const coursDuJour = PLANNING[jourIndex] || [];
  
  // Filtrer selon type d'abonnement
  let coursFiltrés = coursDuJour;
  if(aboType === 'fitness') {
    // Pas de cours collectifs
    return;
  } else if(aboType === 'cours-matin') {
    coursFiltrés = coursDuJour.filter(c => c.type === 'matin');
    if(session === 'apres-midi') return;
  } else if(aboType === 'cours-apres-midi') {
    coursFiltrés = coursDuJour.filter(c => c.type === 'apres-midi');
    if(session === 'matin') return;
  }
  
  if(coursFiltrés.length === 0) return;
  
  // Message de motivation du jour
  const msgIndex = date.getDay() % MESSAGES.length;
  const msg = MESSAGES[msgIndex];
  
  const titreSession = session === 'matin' ? 'Cours du matin 🌅' : 'Cours de l\'après-midi 🌞';
  const titreArabe = session === 'matin' ? 'دروس الصباح' : 'دروس بعد الظهر';
  
  // Construire la liste des cours
  let listeCours = coursFiltrés.map(c => {
    return `• ${c.heure} — ${c.nom}${c.coach ? ' (' + c.coach + ')' : ''}`;
  }).join('\n');
  
  const body = `"${msg.fr}"\n${msg.ar}\n\n📋 Tes cours :\n${listeCours}\n\nOn t'attend ! 💪`;
  
  self.registration.showNotification(`💪 Fitland — ${titreSession}`, {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `cours-${session}`,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200]
  });
}

function verifierAboEtAnniv() {
  const userData = self.userData || {};
  const now = new Date();
  
  // Vérifier anniversaire
  if(userData.notifAnniv && userData.dob) {
    const dob = new Date(userData.dob);
    if(dob.getMonth() === now.getMonth() && dob.getDate() === now.getDate()) {
      const nom = userData.nom || 'Membre';
      self.registration.showNotification('🎂 Joyeux anniversaire !', {
        body: `Joyeux anniversaire ${nom} ! 🎉\nميلاد سعيد ! تمنياتنا بالصحة والسعادة\n\nL'équipe Fitland vous souhaite le meilleur 💚`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'anniversaire',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
      });
    }
  }
  
  // Vérifier fin d'abonnement
  if(userData.notifAbo && userData.aboStart && userData.aboDur) {
    const start = new Date(userData.aboStart);
    const end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(userData.aboDur));
    
    const diffMs = end.getTime() - now.getTime();
    const diffJours = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if(diffJours === 7) {
      self.registration.showNotification('⚠️ Abonnement — اشتراكك', {
        body: `اشتراكك ينتهي خلال 7 أيام — جدّد اليوم واستفد من تخفيض 10% 🎁\nVotre abonnement expire dans 7 jours — Renouvelez aujourd'hui !`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'abo-expire',
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });
    } else if(diffJours === 3) {
      self.registration.showNotification('🚨 Abonnement — اشتراكك', {
        body: `باقي 3 أيام فقط — لا تفوّت فرصة التخفيض 5% ⚡\nPlus que 3 jours — Ne manquez pas la réduction !`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'abo-expire',
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });
    }
  }
}

function showTestNotif(data) {
  const msg = MESSAGES[0];
  self.registration.showNotification('💪 Fitland — Test Notification', {
    body: `"${msg.fr}"\n${msg.ar}\n\n📋 Test cours :\n• 09h00 — Morning Fitness (Marwa)\n• 09h30 — BFC (Khawla)\n\nOn t'attend ! 🏋️`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'test',
    requireInteraction: false,
    vibrate: [200, 100, 200]
  });
}

// Clic sur notification
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      if(list.length > 0) {
        return list[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
