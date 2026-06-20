// AFRIM PAY API v4.20 — Fix limite JSON 15mb pour photos KYC en base64
const express = require('express')
// ══ Firebase Admin SDK pour Push Notifications ══
let fcmAdmin = null
try {
  const admin = require('firebase-admin')
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: 'afrim-pay',
        clientEmail: 'firebase-adminsdk-fbsvc@afrim-pay.iam.gserviceaccount.com',
        privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCsPZGGkcXWdmD5
4IJALNZl8Cg4+Ap04ZIUxRCB7lg9rDRq1SoNAkbnCaeFZ2cgg8D7zYpVC93M5rBR
nzV1T0llpKCDhhUJF1RQbak1mEnD6MQi1o9PXotY8Eufl1c2QcQefL9Wl+oTsuQr
b9sRO14BBdUejL3W9+0VDniDArMVW0t9MqV7glz9cVGBrafQ13A1OuxYHVs8IsLO
OgjDekQsbSJ6iwu6GrsyNThjN5V7dGfM8m3lXxPWiQOdIN7Y5Sf2W9cpNxQpLmX2
hh/lFgN+D9JURuQGz0710cHQ6tsYMVMPk4HIdBzgstxDq9w6jt9J834+V6CE6PcL
iPOJvtDBAgMBAAECggEARjVKjon5FLRoTzK+pR4hvqeoHaCt0nroKuMxGWVoPqtl
Km79lxPohuCeknhVxyEtlvZvfr85h/44vOyiw9Cv4Gi8rSAIjw4dZjNtF9Wdq+fD
m1fOTtIBBx3cFY+BEzK3mJ3M+KUv2xu+eh48M8f5R31zI+LGt0uULlMZuH1vNjK2
2fwv0GKi9D7Zjj5XM6voXO8XLxi+uiETq1CAAow/TScSsA/fVYIik3oR71t/fANP
SDcIW5lrFKYefh1H0wX7+32xL1XTQj2WYlyAdyyVunYLAQp9FxpsLilIQvrJs7Kx
IboSg+0aJTGX6efgm6Ah3NYmVnUnlM8VIV/sco5oaQKBgQDjE34wE0fU3cjUMqhm
g052QEd9F7y1ahUeQ0ThZC6SAl1slmB0KnEt94P0qwPCYoLXsjCrbxkO6LpAiyNo
EVXfg6zGwKesse7HREV/NUwdswTAfuqg6BPUisLVljWP3Wznyiy0x2uHpwJPg1AS
Bp/nVejfEJoPtMI6EY/Fwi2tPwKBgQDCLf4xK7eiaTMtKkysP7mUu7UWJaREWmbm
kNvwFmeuAtM0falN2tE0jU+P3xh8YEWS++WJebm8p0Pujj7NKF5wPdiqvgL4Ji/+
X5TCJ1Ea33ULIlX5eBa7+rtMK/Wgpc40c89eOYTzRR11n3Pbfs7QHfn+XsqFgWk+
pitqIO4B/wKBgQCt0yYttxStpnkttvmiP7G4Y8xVve3/EY3I9MWto/riWl0Z2qNL
SZIKFgc1LBRcoPx4ETeghBMyjoTFE72u1FZgG3QPUTsJv8uBTonErw/tTDS/Bmil
dAJ6GR68UZf+4QmVBfbjDCUMWpQyOdr5cYjGlcUFvLeyfjSQLxFX2SUOEQKBgB+H
OjufnoxnSmDt+k8Jdcd5htiWugpDJ2wOXzenW6Q8XzCpqqCyg79lpmJ01dP0Cbfo
4Icm1YqVGgmU3QuQn2zYDeMDQRYrlSVXPZ8cpSWY3Lc3FwCPiBlzh4/Bn3s7ELUh
jKz+5+Bb+4GKp1QfTdMq2tl7aKSus3jxoCD2Qc7fAoGALSZZajqkYJOLAluF7GSu
WsuZrtL3KTDAw1H5eELP6cVZUe4ILVHkrHGfWGW+CB5gRqWWKDcmhJP6XLZULTPy
jiV4OsTIc/AGPqyXKXPJF6p7faVFMs3heaqlNV3uA0IEaBLanmGNl1FKiMG2HUMB
NVvSi12PISUaJe3cnUpUl5U=
-----END PRIVATE KEY-----
`
      })
    })
  }
  fcmAdmin = admin
  console.log('[FCM] Firebase Admin SDK initialisé')
} catch(e) {
  console.warn('[FCM] firebase-admin non disponible:', e.message)
}

// Envoyer une push notification FCM
async function sendPush(fcmToken, title, body, data={}) {
  if (!fcmAdmin || !fcmToken) return
  try {
    await fcmAdmin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])),
      android: { priority: 'high', notification: { sound: 'default', channelId: 'afrim_pay' } },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { icon: 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/logo.png', badge: 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/logo.png', sound: 'default' }
      }
    })
  } catch(e) { console.warn('[FCM] Push error:', e.message) }
}
const cors = require('cors')
const helmet = require('helmet')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')
const { Pool } = require('pg')
// Enregistrer le type UUID pour que pg accepte les strings UUID sans cast
require('pg').types.setTypeParser(2950, v => v)
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false })
const sql = (query, ...args) => {
  // Accepte sql(q, [p1,p2]) ou sql(q, p1, p2)
  const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args.length > 0 ? args : undefined
  return pgPool.query(query, params).then(r => r.rows)
}

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'afrim_jwt_secret_2024'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'afrim_refresh_secret_2024'

// ── Helper notifications ──────────────────────────────────────────────
// Récupère l'ID fiable depuis la base (format UUID avec tirets = même format que notifications)
async function getUidSql(userId) {
  if (!userId) return null
  // Si c'est déjà une string UUID avec tirets, l'utiliser directement
  const s = String(userId)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s
  // Sinon, Buffer ou autre format — chercher via Prisma
  try {
    const row = await sql(
      'SELECT id::text as id FROM utilisateurs WHERE id = $1', userId
    )
    if (row && row[0]) return row[0].id
  } catch(e) {}
  // Dernier recours : convertir Buffer en hex
  if (Buffer.isBuffer(userId)) return userId.toString('hex')
  return s
}

async function notifier(userId, type, titre, message, data = {}) {
  if (!userId) { console.error('notifier: userId manquant!'); return }
  const uidStr = await getUidSql(userId)
  if (!uidStr) { console.error('notifier: uid introuvable pour', userId); return }
  try {
    await pgPool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [uidStr, type, titre, message, JSON.stringify(data||{})]
    )
    console.log('✉ Notif OK:', type, '->', uidStr.substring(0,8)+'...')
    // ══ Envoyer push FCM si token enregistré ══
    const tokenRows = await sql(
      `SELECT fcm_token FROM utilisateurs WHERE id=$1 AND fcm_token IS NOT NULL LIMIT 1`, uidStr
    ).catch(()=>[])
    if (tokenRows.length && tokenRows[0].fcm_token) {
      await sendPush(tokenRows[0].fcm_token, titre, message, { type, ...data })
    }
  } catch(e) { 
    console.error('notif ERREUR:', e.message, '| uid:', uidStr.substring(0,8), '| type:', type)
  }
}

// Types de notifications :
// 'transaction' — dépôt, retrait, transfert, paiement
// 'kyc'         — validation, refus, upgrade
// 'securite'    — connexion, verrouillage, reset PIN
// 'systeme'     — message admin, alerte
// 'parrainage'  — nouveau filleul, récompense


app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '15mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }))

const signAccess = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: '2h' })
const signRefresh = (p) => jwt.sign(p, JWT_REFRESH_SECRET, { expiresIn: '7d' })
const ok = (res, data, s = 200) => res.status(s).json({ success: true, data })
const err = (res, msg, s = 400) => res.status(s).json({ success: false, message: msg })

// ═══ LOG ACTIONS SENSIBLES ═══
async function logAction(acteur, action, cible, detail=''){
  try {
    // Convertir UUID Buffer → string (Prisma retourne les UUID comme Buffer)
    const toStr = (v) => {
      if (!v) return ''
      if (Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
      return String(v)
    }
    await pgPool.query(
      `INSERT INTO actions_log (acteur_id, acteur_nom, acteur_role, acteur_tel, action, cible_id, cible_nom, cible_role, cible_tel, detail, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [toStr(acteur.id), ((acteur.prenom||'')+' '+(acteur.nom||'')).trim(), acteur.role||'?', acteur.telephone||'?', action, toStr(cible.id), ((cible.prenom||'')+' '+(cible.nom||'')).trim(), cible.role||'?', cible.telephone||'?', detail||'']
    )
  } catch(e){ console.error('logAction error:', e.message) }
}

// ── PLAFOND EFFECTIF (client et business uniquement) ──
async function calculerPlafondEffectif(utilisateur) {
  if (!['client','business'].includes(utilisateur.role)) return 999999999
  const kyc = utilisateur.kycNiveau || 'KYC1'
  // Compter les filleuls RATTACHÉS (conditions entrée+sortie remplies)
  const nbRattaches = await sql(
    `SELECT COUNT(*) as n FROM rattachements WHERE parrain_id = $1 AND statut = 'valide'`,
    utilisateur.id
  ).then(r => Number(r[0]?.n || 0)).catch(() => 0)

  if (kyc === 'KYC3') {
    if (nbRattaches >= 500) return 100000
    if (nbRattaches >= 200) return 50000
    return 20000
  }
  if (kyc === 'KYC2') {
    if (nbRattaches >= 200) return 50000
    return 20000
  }
  return 20000 // KYC1 toujours 20000
}

// ── VÉRIFIER ET VALIDER UN RATTACHEMENT ──
// UNE SEULE CONDITION : dépôt OU transfert reçu >= 500 FCFA → rattaché à vie
// Le parrain reçoit 10% des frais générés par son filleul rattaché (retraits/paiements)
async function verifierRattachement(filleulId, typeOp, montant) {
  if (montant < 500) return
  // Seules les entrées d'argent comptent
  if (!['depot', 'transfert_recu'].includes(typeOp)) return
  try {
    const filleulRows = await sql(`SELECT id::text as id, parrain_id::text as "parrainId" FROM utilisateurs WHERE id = $1 LIMIT 1`, filleulId)
    const filleul = filleulRows[0] || null
    if (!filleul || !filleul.parrainId) return
    // Vérifier s'il est déjà rattaché
    const existing = await sql(
      `SELECT statut FROM rattachements WHERE filleul_id = $1`, filleulId
    ).then(r => r[0] || null).catch(() => null)
    if (existing && existing.statut === 'valide') return // Déjà rattaché à vie
    if (existing) {
      // Mettre à jour en valide
      await pgPool.query(
        `UPDATE rattachements SET statut='valide', date_entree=NOW() WHERE filleul_id = $1`,
        [filleulId]
      )
    } else {
      // Créer et valider directement
      await pgPool.query(
        `INSERT INTO rattachements (id, parrain_id, filleul_id, date_entree, statut, created_at)
         VALUES ($1,$2,$3,NOW(),'valide',NOW())`,
        [require('crypto').randomUUID(), filleul.parrainId, filleulId]
      )
    }
    console.log('[RATTACHEMENT] Validé:', filleulId, '→ parrain:', filleul.parrainId)
    // Le suivi anti-triche (remboursement filleul → parrain dans les 7 jours) est fait
    // par le job périodique horaire qui scanne tous les rattachements valides récents.
  } catch(e) {
    console.warn('[RATTACHEMENT] Erreur:', e.message)
  }
}

async function creerAlerteRattachementSuspect(parrainId, filleulId, montant, dateCreation, motif) {
  const [parrainInfo, filleulInfo] = await Promise.all([
    sql(`SELECT prenom, nom, telephone, role FROM utilisateurs WHERE id = $1`, parrainId).then(r => r[0]),
    sql(`SELECT prenom, nom, telephone FROM utilisateurs WHERE id = $1`, filleulId).then(r => r[0])
  ])
  const nomParrain = parrainInfo ? `${parrainInfo.prenom||''} ${parrainInfo.nom||''} (${parrainInfo.telephone||'?'})` : parrainId
  const nomFilleul = filleulInfo ? `${filleulInfo.prenom||''} ${filleulInfo.nom||''} (${filleulInfo.telephone||'?'})` : filleulId
  await pgPool.query(
    `INSERT INTO alertes (titre, description, gravite, service, auteur, auteur_role) VALUES ($1,$2,$3,$4,$5,$6)`,
    '🚨 Triche rattachement détectée — détachement automatique',
    `${motif}. Parrain: ${nomParrain}. Filleul: ${nomFilleul}. Montant: ${montant} FCFA le ${dateCreation}. Le filleul a été détaché automatiquement du parrain. Vérifier l'historique complet et sanctionner si confirmé.`,
    'critique', 'backoffice', 'systeme', 'systeme'
  )
  console.log('[ANTI-TRICHE] Alerte créée + détachement: parrain', parrainId, '↔ filleul', filleulId)
}

async function verifierPlafondParrainage(clientId, montantAjouter) {
  // Les plafonds KYC concernent uniquement les GAINS DE PARRAINAGE
  // (10% des frais des filleuls rattachés), pas les dépôts/retraits
  const toUUID0 = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
  const clientIdStr = toUUID0(clientId)
  const debut = new Date(); debut.setDate(1); debut.setHours(0,0,0,0)
  // Compter les gains de parrainage ce mois (type commission dans commissions)
  const result = await sql(
    `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions
     WHERE beneficiaire_id = $1 AND type_commission = 'parrainage'
     AND date_calcul >= $2`,
    clientIdStr, debut
  )
  const totalMois = Number(result[0]?.total || 0)
  const clientRows = await sql(`SELECT kyc_niveau FROM utilisateurs WHERE id = $1`, clientIdStr)
  if (!clientRows.length) return { plafond: 999999999, totalMois: 0, reste: 999999999 }
  const kyc = clientRows[0].kyc_niveau || 'KYC1'
  const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
  const plafond = plafonds[kyc] || 20000
  if (totalMois + montantAjouter > plafond) {
    throw new Error('Plafond de parrainage atteint. Plafond ' + kyc + ' : ' + plafond.toLocaleString('fr-FR') + ' FCFA/mois de gains parrainage')
  }
  return { plafond, totalMois, reste: plafond - totalMois }
}
// Alias pour compatibilité
async function verifierPlafondMensuel(clientId, montantAjouter) {
  return verifierPlafondParrainage(clientId, montantAjouter)
}

// ═══ ROLES BACK-OFFICE ═══
// admin         → accès total
// superviseur   → sa zone : users, tickets, alertes, kyc validate
// support_client→ recherche client (lecture), tickets, remboursement
// support_tech  → transactions, alertes système, tickets escaladés

const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return err(res, 'Token manquant', 401)
  // 1. Vérifier JWT (expiration/signature)
  let p
  try { p = jwt.verify(h.slice(7), JWT_SECRET) }
  catch (e) { return err(res, 'Token expiré', 401) }
  // 2. Charger utilisateur en base
  try {
    const authRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.kyc_niveau as "kycNiveau", u.kyc_niveau_demande as "kycNiveauDemande", u.code_parrainage as "codeParrainage", u.parrain_id::text as "parrainId", u.zone, u.pin_hash as "pinHash",
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float,'plafondMensuel',c.plafond_mensuel::float,'typeCompte',c.type_compte)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.id = $1 GROUP BY u.id`, p.userId
    )
    const user = authRows[0] || null
    if (!user) return err(res, 'Compte introuvable', 401)
    if (!user.comptes) user.comptes = []
    if (user.statut === 'bloque') return err(res, 'Compte bloqué. Contactez le support.', 401)
    req.user = user
    next()
  } catch (e) { return err(res, e.message || 'Erreur serveur auth', 500) }
}

const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : err(res, 'Permission refusée', 403)

// Téléphone du Super Back-office — peut avoir role='admin' OU role='backoffice' en base,
// donc toujours vérifier via le téléphone, pas seulement via le rôle.
const SUPER_ADMIN_TEL = '0505414751'
const isSuperAdminUser = (u) => !!u && (u.role === 'admin' || u.role === 'backoffice') && u.telephone === SUPER_ADMIN_TEL
// Middleware : autorise le rôle backoffice, OU le Super Back-office quel que soit son rôle exact
const roleBackofficeOuSuperAdmin = (req, res, next) =>
  (req.user.role === 'backoffice' || isSuperAdminUser(req.user)) ? next() : err(res, 'Permission refusée', 403)

// Rôles back-office complets
const BACKOFFICE = ['admin', 'backoffice', 'superviseur', 'support_client', 'support_tech']
const ADMIN_SUP = ['admin', 'backoffice', 'superviseur']
const ADMIN_ONLY = ['admin', 'backoffice']  // backoffice = gestionnaire (tout sauf supprimer)
const SUPPORT_CLIENT = ['admin', 'backoffice', 'support_client', 'support_tech']
const ALL_STAFF = ['admin', 'backoffice', 'support_client', 'support_tech', 'superviseur', 'master', 'mini_master']
const ALL_ROLES_NOTIF = ['client', 'agent', 'business', 'mini_master', 'master', 'superviseur', 'support_client', 'support_tech', 'admin', 'backoffice']
const SUPPORT_TECH = ['admin', 'backoffice', 'support_tech']
// Note: Les suppressions restent admin uniquement (voir routes DELETE)
const OPERATIONS = ['agent', 'mini_master', 'master', 'superviseur', 'admin']

// ── Helper universel Buffer→UUID ──────────────────────────────────
const toUUID = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }

// ═══ SETUP (sans auth) ═══
// Route de setup : créer la table alertes manuellement si elle n'existe pas
// Migration : renommer l'ancienne table alertes et créer la nouvelle
app.get('/setup/migrate-alertes', async (req, res) => {
  try {
    // Renommer l'ancienne table
    await pgPool.query(
      "ALTER TABLE alertes RENAME TO alertes_fraude_old"
    ).catch(e => console.log('rename:', e.message))
    // Créer la nouvelle table alertes
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        gravite TEXT NOT NULL DEFAULT 'moyenne',
        service TEXT NOT NULL DEFAULT 'admin',
        statut TEXT NOT NULL DEFAULT 'ouverte',
        auteur TEXT NOT NULL DEFAULT 'systeme',
        auteur_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        traite_par TEXT,
        resolution TEXT
      )
    `)
    await pgPool.query(
      "CREATE INDEX IF NOT EXISTS idx_alertes_service ON alertes(service, statut, created_at DESC)"
    ).catch(()=>{})
    res.json({ ok: true, message: 'Migration réussie — nouvelle table alertes créée' })
  } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.get('/setup/check-alertes', async (req, res) => {
  try {
    const cols = await sql(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='alertes' ORDER BY ordinal_position"
    )
    const count = await sql("SELECT COUNT(*)::int as n FROM alertes")
    res.json({ columns: cols, count: count[0].n })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.get('/setup/create-alertes', async (req, res) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        gravite TEXT NOT NULL DEFAULT 'moyenne',
        service TEXT NOT NULL DEFAULT 'admin',
        statut TEXT NOT NULL DEFAULT 'ouverte',
        auteur TEXT NOT NULL DEFAULT 'systeme',
        auteur_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        traite_par TEXT,
        resolution TEXT
      )
    `)
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_alertes_service ON alertes(service, statut, created_at DESC)
    `).catch(()=>{})
    res.json({ ok: true, message: 'Table alertes créée avec succès' })
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Route pour créer un compte equipe interne — SQL pur, sans Prisma
app.get('/setup/create-internal/:role/:tel/:prenom/:nom', async (req, res) => {
  try {
    const { role, tel, prenom, nom } = req.params
    const allowedRoles = ['admin','backoffice','support_client','support_tech','superviseur']
    if (!allowedRoles.includes(role)) return res.status(400).json({error:'Role invalide'})
    const pinHash = await bcrypt.hash('1234', 10)
    const code = role.slice(0,3).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase()
    const rows = await sql(
      `INSERT INTO utilisateurs (id, prenom, nom, telephone, pin_hash, role, statut, code_parrainage, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'actif', $6, NOW(), NOW())
       RETURNING id::text, prenom, nom, telephone, role, statut`,
      prenom, nom, tel, pinHash, role, code
    )
    res.json({ ok: true, ...rows[0], message: 'Compte créé avec PIN 1234' })
  } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.get('/setup/make-admin/:tel', async (req, res) => {
  try {
    const uRows = await sql(`UPDATE utilisateurs SET role='admin', statut='actif', updated_at=NOW() WHERE telephone=$1 RETURNING role, statut`, req.params.tel)
    if (!uRows[0]) return res.json({ error: 'Utilisateur introuvable' })
    return res.json({ success: true, role: uRows[0].role, statut: uRows[0].statut })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/setup/create-test-accounts', async (req, res) => {
  try {
    const pinHash = await bcrypt.hash('1234', 10)
    const comptes = [
      { prenom:'Agent', nom:'Test', telephone:'0101010101', role:'agent', zone:'Zone1' },
      { prenom:'Business', nom:'Test', telephone:'0202020202', role:'business', zone:null },
      { prenom:'Master', nom:'Test', telephone:'0303030303', role:'master', zone:'Zone1' },
      { prenom:'MiniMaster', nom:'Test', telephone:'0404040404', role:'mini_master', zone:'Zone1' },
      { prenom:'Superviseur', nom:'Test', telephone:'0505050505', role:'superviseur', zone:null },
    ]
    const results = []
    for (const c of comptes) {
      try {
        const code = c.prenom.slice(0,3).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase()
        await sql(
          `INSERT INTO utilisateurs (id,prenom,nom,telephone,pin_hash,role,zone,kyc_niveau,statut,code_parrainage,created_at,updated_at)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'KYC1','actif',$7,NOW(),NOW())
           ON CONFLICT (telephone) DO UPDATE SET role=$5, statut='actif', pin_hash=$4, updated_at=NOW()`,
          c.prenom, c.nom, c.telephone, pinHash, c.role, c.zone||null, code
        )
        const tRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE telephone=$1`, c.telephone)
        if (tRows[0]) {
          const cid_t = require('crypto').randomUUID()
          const cExist = await sql(`SELECT id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, tRows[0].id)
          if (!cExist.length) await pgPool.query(
            `INSERT INTO comptes (id,utilisateur_id,solde,plafond_mensuel,type_compte,created_at,updated_at) VALUES ($1,$2,100000,500000,$3,NOW(),NOW())`,
            [cid_t, tRows[0].id, c.role]
          )
        }
        results.push({ telephone: c.telephone, role: c.role, statut: 'ok' })
      } catch(e) { results.push({ telephone: c.telephone, error: e.message }) }
    }
    return res.json({ success: true, comptes: results })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AFRIM PAY API v4.20' }))

// Test colonnes table commissions
app.get('/test/comm-columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'commissions' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Test colonnes table transactions
app.get('/test/columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) {
    return res.json({ ok: false, error: e.message })
  }
})

// Test colonnes table comptes
app.get('/test/comptes-columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'comptes' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Test KYC table existence
app.get('/test/kyc', async (req, res) => {
  try {
    const result = await sql(`SELECT COUNT(*) as count FROM kyc_documents`)
    return res.json({ ok: true, kycDocumentsCount: Number(result[0].count), message: 'Table kyc_documents accessible' })
  } catch(e) {
    return res.json({ ok: false, error: e.message, hint: 'Table inexistante - redemarrer le serveur pour la creer' })
  }
})

// Test colonnes table kyc_documents
app.get('/test/kyc-columns', async (req, res) => {
  try {
    const cols = await sql(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'kyc_documents' 
      ORDER BY ordinal_position
    `)
    return res.json({ ok: true, columns: cols })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Test insert KYC
app.post('/test/kyc', async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier } = req.body
    const kycId = require('crypto').randomUUID()
    await pgPool.query(`INSERT INTO kyc_documents (id,utilisateur_id,type_document,url_fichier,hash_fichier,statut,created_at,updated_at) VALUES ($1,$2,$3,$4,'test','soumis',NOW(),NOW())`,
      [kycId, userId, typeDocument, urlFichier])
    return res.json({ ok: true, doc: { id: kycId, utilisateurId: userId, typeDocument, urlFichier } })
  } catch(e) {
    return res.json({ ok: false, error: e.message })
  }
})
app.get('/', (req, res) => res.json({ message: 'AFRIM PAY API v4.20' }))

// Route test envoi notif directe sans auth — TEMPORAIRE DIAGNOSTIC
app.get('/debug/test-notif', async (req, res) => {
  const result = { steps: [] }
  try {
    const count = await sql(
      "SELECT COUNT(*)::int as n FROM utilisateurs WHERE role = 'client' AND statut NOT IN ('suspendu','bloque')"
    )
    result.steps.push({ step: 'count_clients', value: count[0].n })
    const users = await sql(
      "SELECT id::text as id, telephone FROM utilisateurs WHERE role = 'client' AND statut NOT IN ('suspendu','bloque') LIMIT 3"
    )
    result.steps.push({ step: 'sample_ids', value: users })
    if (users.length > 0) {
      const uid = users[0].id
      await pgPool.query(
        "INSERT INTO notifications (utilisateur_id, type, titre, message, data) VALUES ($1,'systeme','Test debug','Message test debug','{}')",
        [uid]
      )
      result.steps.push({ step: 'insert_notif', value: 'OK uid ' + uid.substring(0,8) })
      const check = await sql(
        "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", uid
      )
      result.steps.push({ step: 'verify_notif', value: check[0].n + ' notif(s)' })
    }
    result.success = true
  } catch(e) { result.error = e.message; result.success = false }
  return res.json(result)
})

// Route debug stats utilisateurs sans auth — TEMPORAIRE
app.get('/debug/users-by-role', async (req, res) => {
  try {
    const stats = await sql(
      'SELECT role, statut, COUNT(*)::int as total FROM utilisateurs GROUP BY role, statut ORDER BY role, statut'
    )
    return res.json({ ok: true, stats })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Route debug : notifs d'un user par telephone
app.get('/debug/notifs-user', async (req, res) => {
  try {
    const tel = req.query.tel || '0789104688'
    const user = await sql(
      "SELECT id::text as id, telephone, role FROM utilisateurs WHERE telephone = $1", tel
    )
    if (!user.length) return res.json({ ok: false, error: 'user introuvable tel=' + tel })
    const uid = user[0].id
    const notifs = await sql(
      "SELECT utilisateur_id, titre, lu, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT 5", uid
    )
    const allIds = await sql(
      "SELECT utilisateur_id, COUNT(*)::int as n FROM notifications GROUP BY utilisateur_id LIMIT 5"
    )
    return res.json({ ok: true, uid: uid, notifs_count: notifs.length, notifs: notifs, all_ids: allIds })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// ═══ AUTH ═══
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { telephone, pin } = req.body
    const loginRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.pin_hash as "pinHash", u.kyc_niveau as "kycNiveau", u.kyc_niveau_demande as "kycNiveauDemande", u.code_parrainage as "codeParrainage", u.parrain_id::text as "parrainId", u.zone,
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float,'plafondMensuel',c.plafond_mensuel::float,'typeCompte',c.type_compte)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.telephone = $1 GROUP BY u.id`, telephone
    )
    const user = loginRows[0] || null
    if (!user) return err(res, 'Compte introuvable', 401)
    if (!user.comptes) user.comptes = []
    if (user.statut === 'bloque') return err(res, 'Compte bloqué', 401)
    const valid = await bcrypt.compare(pin, user.pinHash)
    if (!valid) return err(res, 'PIN incorrect', 401)
    const payload = { userId: user.id, role: user.role }
    const accessToken = signAccess(payload)
    const refreshToken = signRefresh(payload)
    const rtId = require('crypto').randomUUID()
    const rtExp = new Date(Date.now() + 7*86400000)
    await pgPool.query(`INSERT INTO refresh_tokens (id,token,utilisateur_id,expires_at,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [rtId, refreshToken, user.id, rtExp]).catch(()=>{})
    const { pinHash, ...safe } = user
    return ok(res, { accessToken, refreshToken, user: safe })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { prenom, nom, telephone, pin, role: r, kycNiveau, parrainCode, zone } = req.body
    if (!prenom || !nom || !telephone || !pin) return err(res, 'Champs obligatoires manquants')
    if (!/^\d{4}$/.test(pin)) return err(res, 'PIN doit contenir 4 chiffres')

    // Vérifier si le numéro existe déjà
    const existsRows = await sql(
      `SELECT id::text as id, prenom, nom, telephone, role, statut, code_parrainage as "codeParrainage", kyc_niveau as "kycNiveau" FROM utilisateurs WHERE telephone=$1 LIMIT 1`,
      telephone
    )
    if (existsRows.length) {
      // Le compte utilisateur existe — s'assurer qu'il a un compte wallet
      const existUser = existsRows[0]
      const plafonds2 = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
      const kyc2 = existUser.kycNiveau || 'KYC1'
      const plafond2 = plafonds2[kyc2] || 20000
      const cid2 = require('crypto').randomUUID()
      // Vérifier si le compte wallet existe déjà avant d'insérer
      const compteExist2 = await sql(
        `SELECT id FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, existUser.id
      ).catch(()=>[])
      if (!compteExist2.length) {
        await pgPool.query(
          `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at, updated_at)
           VALUES ($1, $2, 0, $3, $4, NOW(), NOW())`,
          [cid2, existUser.id, plafond2, existUser.role || 'client']
        ).catch(()=>{})
      }
      return err(res, 'Numéro déjà utilisé')
    }

    const pinHash = await bcrypt.hash(pin, 10)
    const code = prenom.slice(0,3).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase()
    let parrainId = null
    if (parrainCode) {
      const pRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE code_parrainage=$1 LIMIT 1`, parrainCode)
      if (pRows[0]) parrainId = pRows[0].id
    }
    // Plafond selon rôle et KYC
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const kyc = kycNiveau || 'KYC1'
    const internalRoles = ['admin','support_client','support_tech','backoffice','superviseur']
    const isInternal = internalRoles.includes(r||'client')
    const plafond = isInternal ? 999999999 : (plafonds[kyc] || 20000)
    let user
    if (isInternal) {
      // SQL pur pour éviter l'enum KycNiveau de Prisma
      const rows = await sql(
        `INSERT INTO utilisateurs (id, prenom, nom, telephone, pin_hash, role, statut, code_parrainage, parrain_id, zone, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'actif', $6, $7, $8, NOW(), NOW())
         RETURNING id::text, prenom, nom, telephone, role, statut, code_parrainage as "codeParrainage"`,
        prenom, nom, telephone, pinHash, r||'client',
        code, parrainId||null, zone||null
      )
      user = rows[0]
    } else {
      // SQL brut pour les clients (évite les casts enum KycNiveau/StatutCompte)
      // kyc_niveau reste NULL à l'inscription — sera mis à jour après validation admin
      // Le niveau demandé va dans kyc_niveau_demande
      const rows2 = await sql(
        `INSERT INTO utilisateurs (id, prenom, nom, telephone, pin_hash, role, statut, code_parrainage, parrain_id, zone, kyc_niveau_demande, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'en_attente', $6, $7, $8, $9, NOW(), NOW())
         RETURNING id::text, prenom, nom, telephone, role, statut, code_parrainage as "codeParrainage", kyc_niveau_demande as "kycNiveauDemande"`,
        prenom, nom, telephone, pinHash, r||'client',
        code, parrainId||null, zone||null, kyc
      )
      user = rows2[0]
      // kycNiveau null = en attente de validation
      user.kycNiveau = null
      // Créer le compte wallet (INSERT simple, pas de ON CONFLICT car pas de contrainte UNIQUE)
      const cid = require('crypto').randomUUID()
      const compteExist = await sql(
        `SELECT id FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, user.id
      ).catch(()=>[])
      if (!compteExist.length) {
        await pgPool.query(
          `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at, updated_at)
           VALUES ($1, $2, 0, $3, $4, NOW(), NOW())`,
          [cid, user.id, plafond, String(r||'client')]
        )
      }
    }
    return ok(res, user, 201)
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    const rtRows = await sql(`SELECT token, expires_at as "expiresAt" FROM refresh_tokens WHERE token=$1 LIMIT 1`, refreshToken).catch(()=>[])
    if (!rtRows[0] || new Date(rtRows[0].expiresAt) < new Date()) return err(res, 'Token expiré', 401)
    const p = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    const accessToken = signAccess({ userId: p.userId, role: p.role })
    const newRefresh = signRefresh({ userId: p.userId, role: p.role })
    await pgPool.query(`DELETE FROM refresh_tokens WHERE token=$1`, [refreshToken]).catch(()=>{})
    const newRtId = require('crypto').randomUUID()
    await pgPool.query(`INSERT INTO refresh_tokens (id,token,utilisateur_id,expires_at,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [newRtId, newRefresh, p.userId, new Date(Date.now()+7*86400000)]).catch(()=>{})
    return ok(res, { accessToken, refreshToken: newRefresh })
  } catch (e) { return err(res, e.message, 401) }
})

app.post('/api/v1/auth/logout', async (req, res) => {
  try { const { refreshToken } = req.body; if (refreshToken) await pgPool.query(`DELETE FROM refresh_tokens WHERE token=$1`, [refreshToken]).catch(()=>{}); return ok(res, { message: 'Déconnecté' }) }
  catch (e) { return ok(res, { message: 'Déconnecté' }) }
})

// ═══ USERS ═══
app.get('/api/v1/users/me', authMiddleware, async (req, res) => {
  try {
    // authMiddleware a déjà chargé req.user avec comptes
    const safe = { ...req.user }
    delete safe.pinHash
    // Ajouter kycNiveauDemande depuis SQL brut
    try {
      const extra = await sql(`SELECT kyc_niveau_demande as "kycNiveauDemande" FROM utilisateurs WHERE id = $1`, toUUID(req.user.id))
      if (extra && extra[0]) safe.kycNiveauDemande = extra[0].kycNiveauDemande
    } catch(e) {}
    // Ajouter plafond effectif et nb filleuls pour clients et business
    if (['client','business'].includes(safe.role)) {
      try {
        const nbFilleuls = await sql(`SELECT COUNT(*)::int as n FROM utilisateurs WHERE parrain_id=$1`, safe.id).then(r=>r[0]?.n||0).catch(()=>0)
        const nbRattaches = await sql(
          `SELECT COUNT(*) as n FROM rattachements WHERE parrain_id = $1 AND statut = 'valide'`,
          safe.id
        ).then(r => Number(r[0]?.n || 0)).catch(() => 0)
        const plafondEffectif = await calculerPlafondEffectif(safe)
        safe.nbFilleuls = nbFilleuls
        safe.nbRattaches = nbRattaches
        safe.plafondEffectif = plafondEffectif
      } catch(e) {}
    }
    return ok(res, safe)
  }
  catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/users/change-pin', authMiddleware, async (req, res) => {
  try {
    const { ancienPin, nouveauPin } = req.body
    if (!ancienPin || !nouveauPin) return err(res, 'Ancien et nouveau PIN requis')
    if (!/^\d{4}$/.test(nouveauPin)) return err(res, 'Le nouveau PIN doit contenir 4 chiffres')
    const cpUser = req.user
    const valid = await bcrypt.compare(ancienPin, cpUser.pinHash)
    if (!valid) return err(res, 'Ancien PIN incorrect', 401)
    const pinHash = await bcrypt.hash(nouveauPin, 10)
    await pgPool.query(`UPDATE utilisateurs SET pin_hash=$1, updated_at=NOW() WHERE id=$2`, [pinHash, toUUID(req.user.id)])
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [toUUID(req.user.id)]).catch(()=>{})
    return ok(res, { message: 'PIN modifié avec succès' })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ GET /users — admin, superviseur, support_client, support_tech ═══
// support_client : lecture seule pour recherche par telephone
// superviseur : filtre par zone automatiquement
app.get('/api/v1/users', authMiddleware, role(...BACKOFFICE, 'master', 'mini_master', 'agent'), async (req, res) => {
  try {
    const { q, role: r, statut, limit=30, telephone, zone } = req.query
    const where = {}

    // Filtres de recherche
    if (q) where.OR = [{prenom:{contains:q,mode:'insensitive'}},{nom:{contains:q,mode:'insensitive'}},{telephone:{contains:q}}]
    if (telephone) where.telephone = telephone
    if (r) where.role = r
    if (statut) where.statut = statut

    // Filtre par code parrainage du parrain (pour voir le réseau)
    const { parrainCode, parrainId } = req.query
    if (parrainCode) {
      const parrainLookup = await sql(`SELECT id::text as id FROM utilisateurs WHERE code_parrainage=$1 LIMIT 1`, parrainCode)
      if (parrainLookup[0]) where.parrainId = parrainLookup[0].id
    }
    if (parrainId) where.parrainId = parrainId

    // Superviseur : ne voit pas le personnel interne (admin, support_*)
    if (req.user.role === 'superviseur') {
      where.role = { notIn: ['admin','support_client','support_tech'] }
      if (r) where.role = r // override si filtre explicite non interne
      if (req.user.zone) where.zone = req.user.zone
    }

    // Support client et tech : lecture seule, accès complet pour recherche
    // (ils ne peuvent pas modifier — les routes PATCH ont leurs propres guards)

    // Champs exposés selon rôle
    const select = {
      id:true, prenom:true, nom:true, telephone:true, role:true,
      kycNiveau:true, statut:true, codeParrainage:true, zone:true,
      comptes:true
    }

    // Utiliser queryRaw pour éviter le problème de cast enum sur role/statut
    const whereConditions = []
    const params = []
    let paramIdx = 1
    
    if (where.OR) {
      const q_val = req.query.q
      whereConditions.push(`(LOWER(u.prenom) LIKE LOWER($${paramIdx}) OR LOWER(u.nom) LIKE LOWER($${paramIdx+1}) OR u.telephone LIKE $${paramIdx+2})`)
      params.push(`%${q_val}%`, `%${q_val}%`, `%${q_val}%`)
      paramIdx += 3
    }
    if (where.telephone) { whereConditions.push(`u.telephone = $${paramIdx}`); params.push(where.telephone); paramIdx++ }
    if (where.role && typeof where.role === 'string') { whereConditions.push(`u.role = $${paramIdx}`); params.push(where.role); paramIdx++ }
    if (where.role && where.role.notIn) { 
      const placeholders = where.role.notIn.map((_,i) => `$${paramIdx+i}`).join(',')
      whereConditions.push(`u.role NOT IN (${placeholders})`)
      params.push(...where.role.notIn)
      paramIdx += where.role.notIn.length
    }
    if (where.statut) { whereConditions.push(`u.statut = $${paramIdx}`); params.push(where.statut); paramIdx++ }
    if (where.zone) { whereConditions.push(`u.zone = $${paramIdx}`); params.push(where.zone); paramIdx++ }
    if (where.parrainId) { whereConditions.push(`u.parrain_id = $${paramIdx}`); params.push(where.parrainId); paramIdx++ }
    
    const limitVal = parseInt(limit) || 30
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''
    const users = await sql(
      `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.kyc_niveau as "kycNiveau", u.statut, u.code_parrainage as "codeParrainage", u.zone, u.created_at as "createdAt", COALESCE(c.solde,0) as solde FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id = u.id ${whereClause} ORDER BY u.created_at DESC LIMIT ${limitVal}`,
      ...params
    )
    return ok(res, users)
  } catch (e) { return err(res, e.message, 500) }
})

// PATCH status — admin et superviseur uniquement (pas support)
// PATCH /users/:id/profile — modifier prenom, nom, telephone, zone (admin + superviseur)
app.patch('/api/v1/users/:id/profile', authMiddleware, role('admin','backoffice','superviseur'), async (req, res) => {
  try {
    const { prenom, nom, telephone, zone } = req.body
    if (!prenom || !nom || !telephone) return err(res, 'Prénom, nom et téléphone requis', 400)
    const data = { prenom, nom, telephone }
    if (zone !== undefined) data.zone = zone || null
    const sets = ['prenom=$1','nom=$2','telephone=$3','updated_at=NOW()']
    const pvals = [data.prenom, data.nom, data.telephone]
    if ('zone' in data) { sets.push(`zone=$${pvals.length+1}`); pvals.push(data.zone) }
    pvals.push(req.params.id)
    const uRows = await sql(`UPDATE utilisateurs SET ${sets.join(',')} WHERE id=$${pvals.length} RETURNING id::text as id,prenom,nom,telephone,zone`, ...pvals)
    const user = uRows[0]
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    return ok(res, user)
  } catch(e) { return err(res, e.message, 500) }
})

app.patch('/api/v1/users/:id/status', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try {
    const { statut, motif } = req.body
    const validStatuts = ['actif','suspendu','bloque','en_attente']
    if (!validStatuts.includes(statut)) return err(res, 'Statut invalide', 400)
    // Raw SQL pour éviter erreur 42704 (enum Prisma)
    const rows = await sql(
      `UPDATE utilisateurs SET statut = $1, updated_at = NOW() WHERE id = $2 RETURNING id, prenom, nom, telephone, statut::text as statut`,
      statut, req.params.id
    )
    const user = rows[0]
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    // Notification automatique selon le statut
    const notifs = {
      suspendu: {
        titre: '⚠️ Compte suspendu',
        msg: motif || 'Votre compte AFRIM PAY a été suspendu temporairement suite a un probleme de verification. Veuillez contacter le support pour plus d informations.'
      },
      bloque: {
        titre: '🔴 Compte bloqué',
        msg: motif || 'Votre compte AFRIM PAY a été bloqué. Contactez immédiatement le support AFRIM PAY.'
      },
      actif: {
        titre: '✅ Compte réactivé',
        msg: motif || 'Votre compte AFRIM PAY a été réactivé. Vous pouvez maintenant utiliser tous les services.'
      },
      en_attente: {
        titre: '⏳ Compte en attente',
        msg: motif || 'Votre compte est en attente de validation. Vous serez notifié dès la validation.'
      }
    }
    const n = notifs[statut]
    if (n) {
      await notifier(req.params.id, 'securite', n.titre, n.msg, { statut, motif: motif || null, par: req.user.role })
    }
    await logAction(req.user, 'statut_'+statut, user, motif||'')
    return ok(res, user)
  } catch (e) { return err(res, e.message, 500) }
})

// DELETE user — Super Admin uniquement (0505414751)
app.delete('/api/v1/users/:id', authMiddleware, role('admin'), async (req, res) => {
  try {
    // Vérifier que c'est le super admin
    if (req.user.telephone !== SUPER_ADMIN_TEL) {
      return err(res, 'Action réservée au Super Administrateur AFRIM PAY', 403)
    }
    const userId = req.params.id
    // Vérifier que l'utilisateur existe
    const delRows = await sql(`SELECT id::text as id, prenom, nom, telephone FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    const user = delRows[0] || null
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [userId]).catch(()=>{})
    await pgPool.query(`DELETE FROM commissions WHERE beneficiaire_id=$1`, [toUUID(userId)]).catch(()=>{})
    const compteDelRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, userId)
    if (compteDelRows[0]) {
      const cid_del = compteDelRows[0].id
      await pgPool.query(`DELETE FROM transactions WHERE compte_source_id=$1 OR compte_dest_id=$1`, [cid_del]).catch(()=>{})
      await pgPool.query(`DELETE FROM comptes WHERE id=$1`, [cid_del]).catch(()=>{})
    }
    await pgPool.query(`DELETE FROM utilisateurs WHERE id=$1`, [userId])
    await logAction(req.user, 'suppression_compte', user, 'Compte supprimé définitivement')
    return ok(res, { message: 'Compte supprimé définitivement' })
  } catch (e) { return err(res, e.message, 500) }
})

// Réinitialiser le PIN d'un utilisateur (Support Client + Admin)
app.post('/api/v1/users/:id/reset-pin', authMiddleware, role('admin', 'backoffice', 'superviseur', 'support_client', 'support_technique'), async (req, res) => {
  try {
    const userId = req.params.id
    const rpRows = await sql(`SELECT id::text as id, prenom, nom, telephone, role, statut FROM utilisateurs WHERE id=$1 LIMIT 1`, userId)
    const user = rpRows[0] || null
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    // ── Vérification des permissions de réinitialisation ──
    const SUPER_ADMIN_TEL = '0505414751'
    const me = req.user
    const isSuperAdmin = (me.role === 'admin' || me.role === 'backoffice') && me.telephone === SUPER_ADMIN_TEL
    const BO_TARGETS  = ['admin','superviseur','master','mini_master','agent','business','client','support_client','support_tech']
    const ADM_TARGETS = ['superviseur','master','mini_master','agent','business','client','support_client','support_tech']
    let allowed = false
    if (isSuperAdmin)          allowed = user.telephone !== SUPER_ADMIN_TEL
    else if (me.role === 'backoffice') allowed = user.telephone !== SUPER_ADMIN_TEL && BO_TARGETS.includes(user.role)
    else if (me.role === 'admin')      allowed = ADM_TARGETS.includes(user.role)
    else                               allowed = true // support_client/tech: accès libre aux clients
    if (!allowed) return err(res, 'Permission refusée', 403)
    // Réinitialiser le PIN à 1234 (l'utilisateur devra le changer à la prochaine connexion)
    const pinHash = await bcrypt.hash('1234', 10)
    await pgPool.query(`UPDATE utilisateurs SET pin_hash=$1, updated_at=NOW() WHERE id=$2`, [pinHash, userId])
    await pgPool.query(`DELETE FROM refresh_tokens WHERE utilisateur_id=$1`, [userId]).catch(()=>{})
    await notifier(userId, 'securite', '🔐 Code PIN réinitialisé',
      'Votre code PIN a été réinitialisé à 1234 par le support. Connectez-vous et changez-le immédiatement.',
      { action: 'reset_pin' }
    )
    await logAction(req.user, 'reset_pin', user, 'PIN réinitialisé à 1234')
    return ok(res, { message: 'PIN réinitialisé à 1234.' })
  } catch (e) { return err(res, e.message, 500) }
})

app.get('/api/v1/users/:id/referrals', authMiddleware, async (req, res) => {
  try {
    const filleuls = await sql(`SELECT id::text as id, prenom, nom, telephone, created_at as "createdAt" FROM utilisateurs WHERE parrain_id=$1`, req.params.id)
    const rattRows = await sql(`SELECT COUNT(*) as n FROM rattachements WHERE parrain_id=$1 AND statut='valide'`, req.params.id)
    const nbRattaches = Number(rattRows[0]?.n || 0)
    let totalGains = 0
    if (req.user.statut === 'actif') {
      const gainsRows = await sql(
        `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id = $1`, toUUID(req.params.id)
      )
      totalGains = gainsRows[0]?.total || 0
    }
    return ok(res, { filleuls, nbRattaches, totalGains, parrainageActif: req.user.statut === 'actif' })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ COMPTES ═══
app.get('/api/v1/accounts/me', authMiddleware, async (req, res) => {
  try {
    const toUUID = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const toUUID_acc = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const rows = await sql(
      `SELECT id::text, utilisateur_id::text as "utilisateurId", solde::float, plafond_mensuel::float as "plafondMensuel", type_compte as "typeCompte", created_at as "createdAt"
       FROM comptes WHERE utilisateur_id = $1 LIMIT 1`,
      toUUID_acc(toUUID(req.user.id))
    )
    if (!rows.length) return err(res, 'Compte introuvable', 404)
    return ok(res, rows[0])
  }
  catch (e) { return err(res, e.message, 500) }
})

// ═══ TRANSACTIONS ═══
// Lecture : chacun voit ses propres transactions
// Admin/superviseur/support_tech : voient tout
app.get('/api/v1/transactions', authMiddleware, async (req, res) => {
  try {
    const { limit=20, type, statut, userId } = req.query
    const canSeeAll = ['admin','backoffice','superviseur','support_client','support_tech'].includes(req.user.role)

    let where = {}
    if (canSeeAll && userId) {
      // Recherche par userId (support_client voit transactions d'un client spécifique)
      const cRows1 = await sql(`SELECT id::text FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, userId)
      const c = cRows1[0]
      if (c) where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    } else if (canSeeAll) {
      // Admin/superviseur/support_tech voient tout
      where = {}
    } else {
      // Opérateur voit ses propres transactions
      const cRows2 = await sql(`SELECT id::text FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
      const c = cRows2[0]
      if (!c) return ok(res, [])
      where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    }

    if (type) where.type = type
    if (statut) where.statut = statut

    // Utiliser SQL direct pour éviter les timeouts avec limit élevé
    const txConditions = []
    const txParams = []
    let txIdx = 1
    if (where.OR) {
      txConditions.push(`(t.compte_source_id = $${txIdx} OR t.compte_dest_id = $${txIdx+1})`)
      txParams.push(where.OR[0].compteSourceId, where.OR[1].compteDestId)
      txIdx += 2
    }
    if (type) { txConditions.push(`t.type = $${txIdx}`); txParams.push(type); txIdx++ }
    if (statut) { txConditions.push(`t.statut = $${txIdx}`); txParams.push(statut); txIdx++ }
    const txWhere = txConditions.length > 0 ? 'WHERE ' + txConditions.join(' AND ') : ''
    const txLimit = Math.min(parseInt(limit)||20, 1000)
    const txns = await sql(
      `SELECT t.id::text as id, t.reference, t.type, t.statut, t.montant::float as montant, t.frais::float as frais, t.taux_frais::float as "tauxFrais", t.description, t.initiateur_role as "initiateurRole", t.agent_id::text as "agentId", t.ip_address as "ipAddress", t.compte_source_id::text as compte_source_id, t.compte_dest_id::text as compte_dest_id, t.date_creation as date_creation, t.date_completion as "dateCompletion", us.prenom as "srcPrenom", us.nom as "srcNom", us.telephone as "srcTel", ud.prenom as "destPrenom", ud.nom as "destNom", ud.telephone as "destTel" FROM transactions t LEFT JOIN comptes cs ON cs.id = t.compte_source_id LEFT JOIN utilisateurs us ON us.id = cs.utilisateur_id LEFT JOIN comptes cd ON cd.id = t.compte_dest_id LEFT JOIN utilisateurs ud ON ud.id = cd.utilisateur_id ${txWhere} ORDER BY t.date_creation DESC LIMIT ${txLimit}`,
      ...txParams
    )
    return ok(res, txns)
  } catch (e) { return err(res, e.message, 500) }
})

// Preview dépôt
app.get('/api/v1/transactions/preview/deposit', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const pdRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.statut, json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.telephone=$1 GROUP BY u.id`, telephone
    )
    const client = pdRows[0] || null
    if (!client) return err(res, 'Client introuvable', 404)
    if (!client.comptes) client.comptes = []
    const gainAgent = Math.round(Number(montant)*0.002)
    return ok(res, {...client, frais:0, gainAgent, gainPlatform:0 })
  } catch (e) { return err(res, e.message, 500) }
})

// Preview retrait
app.get('/api/v1/transactions/preview/withdraw', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const pwRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.statut, json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.telephone=$1 GROUP BY u.id`, telephone
    )
    const client = pwRows[0] || null
    if (!client) return err(res, 'Client introuvable', 404)
    if (!client.comptes) client.comptes = []
    const amt=Number(montant); const taux=amt<=50000?0.009:amt<=200000?0.008:0.007
    const frais=Math.round(amt*taux); const gainAgent=Math.round(frais*0.35)
    const solde=client.comptes?.[0]?.solde||0
    return ok(res, {...client, frais, gainAgent, taux, soldeInsuffisant: solde<(amt+frais) })
  } catch (e) { return err(res, e.message, 500) }
})

// Dépôt — agents, MM, Master, admin
app.post('/api/v1/transactions/deposit', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    const agentRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const agentC = agentRows[0] ? { id: agentRows[0].id, solde: agentRows[0].solde } : null
    if (!agentC||agentC.solde<amt) return err(res, 'Liquidité insuffisante')
    const depClientRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.statut, u.parrain_id::text as "parrainId", json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.telephone=$1 GROUP BY u.id`, telephone
    )
    const client = depClientRows[0] || null
    if (!client) return err(res, 'Client introuvable', 404)
    if (!client.comptes?.length) return err(res, 'Compte client introuvable', 404)
    const clientC = client.comptes[0]
    // Pas de plafond sur les dépôts — plafonds KYC = gains de parrainage uniquement
    const gainAgent=Math.round(amt*0.002)
    const ref='DEP-'+Date.now().toString(36).toUpperCase()
    // Créer transaction d'abord
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'depot','complete',$3,$4,$5,0,$6,NOW())`,
      [txId, ref, agentC.id, clientC.id, amt, toUUID(req.user.id)]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id = $2`, [amt, agentC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id = $2`, [amt, clientC.id])
    await pgPool.query(
      `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
       VALUES ($1,$2,'depot_agent',$3,0.002,'verse',NOW())`,
      [commId, toUUID(req.user.id), gainAgent]
    )
    // Notification dépôt au client
    await notifier(client.id, 'transaction', '💰 Dépôt reçu',
      `Votre compte a été crédité de ${amt.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, reference:ref, type:'depot' }
    )
    // Notification commission à l'agent
    await notifier(toUUID(req.user.id), 'transaction', '✅ Dépôt effectué',
      `Dépôt de ${amt.toLocaleString('fr-FR')} F CFA pour ${client.prenom||''} ${client.nom||''}. Commission : +${gainAgent.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, gainAgent, reference:ref, type:'depot_agent' }
    ).catch(()=>{})
    // Rattachement : entrée d'argent
    verifierRattachement(client.id, 'depot', amt).catch(() => {})
    // Récupérer nouveau solde client pour mise à jour immédiate côté client
    const newClientSolde = await sql(`SELECT solde::float as solde FROM comptes WHERE id=$1`, clientC.id).then(r=>r[0]?.solde||0).catch(()=>null)
    return ok(res, {id:txId, reference:ref, type:'depot', montant:amt, gainAgent, clientId:client.id, clientSolde:newClientSolde})
  } catch (e) { return err(res, e.message, 500) }
})

// Retrait — agents, MM, Master, admin
// ══ RETRAIT AVEC AUTORISATION CLIENT (OTP) ══
// OTP stocké en DB table otp_retraits

// ÉTAPE 1 : Agent demande autorisation → génère OTP → notifie client
app.post('/api/v1/transactions/withdraw/request', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 1) return err(res, 'Montant invalide')

    const clientRows = await sql(
      `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut::text as statut,
              u.kyc_niveau::text as "kycNiveau",
              c.id as compte_id, c.solde::float as solde
       FROM utilisateurs u
       LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.telephone = $1 LIMIT 1`, telephone)
    if (!clientRows.length) return err(res, 'Client introuvable', 404)
    const clientRow = clientRows[0]
    const toUUID2 = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const client = { ...clientRow, id: toUUID2(clientRow.id) }
    const clientC = { id: toUUID2(clientRow.compte_id), solde: Number(clientRow.solde||0) }

    if (!['client','business'].includes(client.role)) return err(res, 'Ce compte ne peut pas faire de retrait')
    if (!['actif','en_attente'].includes(client.statut)) return err(res, 'Compte client suspendu ou bloqué')

    const taux = amt<=50000?0.009:amt<=200000?0.008:0.007
    const frais = Math.round(amt*taux)
    const total = amt + frais
    if (clientC.solde < total) return err(res, `Solde insuffisant (${clientC.solde} FCFA disponibles)`)

    // Générer OTP 4 chiffres
    const otp = String(Math.floor(1000 + Math.random() * 9000))
    const agentId = toUUID(req.user.id)
    const key = telephone + '_' + agentId
    await pgPool.query(
      `INSERT INTO otp_retraits (cle,otp,amt,frais,total,taux,client_id,client_compte_id,client_nom,agent_id,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()+INTERVAL '5 minutes')
       ON CONFLICT (cle) DO UPDATE SET otp=EXCLUDED.otp,amt=EXCLUDED.amt,frais=EXCLUDED.frais,
       total=EXCLUDED.total,taux=EXCLUDED.taux,client_id=EXCLUDED.client_id,
       client_compte_id=EXCLUDED.client_compte_id,client_nom=EXCLUDED.client_nom,
       agent_id=EXCLUDED.agent_id,expires_at=EXCLUDED.expires_at`,
      [key,otp,amt,frais,total,taux,client.id,clientC.id,
       (client.prenom||'')+' '+(client.nom||''),agentId]
    )

    // Notifier le client avec l'OTP
    const agentRows = await sql(
      `SELECT prenom, nom, telephone FROM utilisateurs WHERE id=$1 LIMIT 1`, agentId
    ).catch(()=>[])
    const agentNom = agentRows[0] ? (agentRows[0].prenom||'') + ' ' + (agentRows[0].nom||'') : 'Un agent'

    await notifier(client.id, 'transaction', '🔐 Autorisation retrait requise',
      `${agentNom} demande à retirer ${amt.toLocaleString('fr-FR')} F CFA de votre compte. Code : ${otp} (valable 5 min).`,
      { otp, montant: amt, frais, total, agentNom, type: 'retrait_otp' }
    )

    return ok(res, {
      clientNom: client.prenom + ' ' + client.nom,
      montant: amt, frais, total, taux,
      message: 'Code OTP envoyé au client. Demandez-lui le code.'
    })
  } catch(e) { return err(res, e.message, 500) }
})

// ÉTAPE 2 : Agent saisit l'OTP → retrait exécuté
app.post('/api/v1/transactions/withdraw/confirm', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, otp } = req.body
    const agentId = toUUID(req.user.id)
    const key = telephone + '_' + agentId
    const otpRows = await pgPool.query(`SELECT * FROM otp_retraits WHERE cle=$1`,[key])
    const otpRow = (Array.isArray(otpRows) ? otpRows : (otpRows.rows||[]))[0] || null

    if (!otpRow) return err(res, 'Aucune demande en attente pour ce client', 400)
    if (new Date() > new Date(otpRow.expires_at)) {
      await pgPool.query(`DELETE FROM otp_retraits WHERE cle=$1`,[key])
      return err(res, 'Code OTP expiré (5 min). Recommencez.', 400)
    }
    if (String(otp).trim() !== String(otpRow.otp)) {
      return err(res, 'Code OTP incorrect', 400)
    }

    // OTP valide → exécuter le retrait
    await pgPool.query(`DELETE FROM otp_retraits WHERE cle=$1`,[key])
    const amt=Number(otpRow.amt), frais=Number(otpRow.frais), total=Number(otpRow.total), taux=Number(otpRow.taux)
    const clientId=otpRow.client_id, clientCompteId=otpRow.client_compte_id, clientNom=otpRow.client_nom

    const agentRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, agentId)
    const agentC = agentRows[0] ? { id: agentRows[0].id, solde: agentRows[0].solde } : null

    const ref = 'RET-' + Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    const gainAgent = Math.round(frais * 0.35)

    // Débiter client + créditer agent
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, [total, clientCompteId])
    if (agentC) await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, [total, agentC.id])

    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'retrait','complete',$3,$4,$5,$6,$7,NOW())`,
      [txId, ref, clientCompteId, agentC?.id||clientCompteId, amt, frais, agentId]
    )

    // Commission agent
    if (gainAgent > 0) {
      await pgPool.query(
        `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
         VALUES ($1,$2,'retrait_agent',$3,$4,'verse',NOW())`,
        [require('crypto').randomUUID(), agentId, gainAgent, taux]
      ).catch(()=>{})
    }

    // Gain parrainage : 10% des frais pour le parrain si rattaché
    try {
      const filleulRatt = await sql(
        `SELECT r.parrain_id FROM rattachements r WHERE r.filleul_id=$1 AND r.statut='valide' LIMIT 1`, clientId
      )
      if (filleulRatt[0]?.parrain_id) {
        const parrainId = filleulRatt[0].parrain_id
        const gainParrain = Math.round(frais * 0.10)
        if (gainParrain > 0) {
          await pgPool.query(
            `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
             VALUES ($1,$2,'parrainage',$3,0.10,'verse',NOW())`,
            [require('crypto').randomUUID(), parrainId, gainParrain]
          )
          await notifier(parrainId,'gains','🤝 Gain parrainage',
            `+${gainParrain.toLocaleString('fr-FR')} FCFA sur le retrait de votre filleul.`,
            {montant:gainParrain,type:'parrainage'}
          ).catch(()=>{})
        }
      }
    } catch(ep){console.warn('[PARRAINAGE]',ep.message)}

    // Notifications
    await notifier(clientId, 'transaction', '💸 Retrait autorisé et effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès. Réf: ${ref}`,
      { montant:amt, frais, total, reference:ref, type:'retrait' }
    )
    await notifier(agentId, 'transaction', '✅ Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA pour ${clientNom}. Commission : +${gainAgent.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, gainAgent, reference:ref, type:'retrait_agent' }
    ).catch(()=>{})

    // Nouveau solde client
    const newSoldeR = await sql(`SELECT solde::float as solde FROM comptes WHERE id=$1`, clientCompteId).then(r=>r[0]?.solde||0).catch(()=>null)

    return ok(res, { id:txId, reference:ref, type:'retrait', montant:amt, frais, total, gainAgent, clientSolde:newSoldeR })
  } catch(e) { return err(res, e.message, 500) }
})

app.post('/api/v1/transactions/withdraw', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    // Raw SQL pour éviter l'enum statut/kyc_niveau
    const clientRows = await sql(
      `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut::text as statut,
              u.kyc_niveau::text as "kycNiveau", u.parrain_id as "parrainId",
              c.id as compte_id, c.solde::float as solde
       FROM utilisateurs u
       LEFT JOIN comptes c ON c.utilisateur_id = u.id
       WHERE u.telephone = $1 LIMIT 1`, telephone)
    if (!clientRows.length) return err(res, 'Client introuvable', 404)
    const clientRow = clientRows[0]
    const toUUID2 = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const client = { ...clientRow, id: toUUID2(clientRow.id), parrainId: toUUID2(clientRow.parrainId) }
    const clientC = { id: toUUID2(clientRow.compte_id), solde: Number(clientRow.solde||0) }
    if (!clientC.id) return err(res, 'Compte client introuvable', 404)
    if (['client','business'].includes(client.role)) {
      if (!['actif','en_attente'].includes(client.statut)) return err(res, 'Compte client suspendu ou bloqué')
    }
    const taux=amt<=50000?0.009:amt<=200000?0.008:0.007
    const frais=Math.round(amt*taux); const gainAgent=Math.round(frais*0.35); const total=amt+frais
    if (clientC.solde<total) return err(res, 'Solde client insuffisant')
    const agentRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const agentC = agentRows[0] ? { id: agentRows[0].id, solde: agentRows[0].solde } : null
    const ref='RET-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'retrait','complete',$3,$4,$5,$6,$7,NOW())`,
      [txId, ref, clientC.id, agentC.id, amt, frais, toUUID(req.user.id)]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id = $2`, [total, clientC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id = $2`, [amt+gainAgent, agentC.id])
    await pgPool.query(
      `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
       VALUES ($1,$2,'retrait_agent',$3,$4,'verse',NOW())`,
      [commId, toUUID(req.user.id), gainAgent, taux*0.35]
    )
    // Notification retrait au client
    await notifier(client.id, 'transaction', '💸 Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès.`,
      { montant:amt, reference:ref, type:'retrait' }
    )
    // Notification commission à l'agent
    await notifier(toUUID(req.user.id), 'transaction', '✅ Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA pour ${client.prenom||''} ${client.nom||''}. Commission : +${gainAgent.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, gainAgent, reference:ref, type:'retrait_agent' }
    ).catch(()=>{})
    // Commission parrain : 10% des frais si filleul rattaché à vie
    if (client.parrainId) {
      sql(
        `SELECT id FROM rattachements WHERE filleul_id = $1 AND statut = 'valide'`,
        client.id
      ).then(async rows => {
        if (!rows || !rows.length) return
        const gainParrain = Math.round(frais * 0.10)
        if (gainParrain < 1) return
        const commParrainId = require('crypto').randomUUID()
        await pgPool.query(
          `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
           VALUES ($1,$2,'parrainage',$3,0.10,'verse',NOW())`,
          [commParrainId, client.parrainId, gainParrain]
        )
        await pgPool.query(
          `UPDATE comptes SET solde=solde+$1 WHERE utilisateur_id = $2`,
          [gainParrain, client.parrainId]
        )
        console.log('[PARRAIN] +' + gainParrain + ' FCFA → parrain:', client.parrainId)
      }).catch(e => console.warn('[PARRAIN]', e.message))
    }
    // Récupérer nouveau solde client pour mise à jour immédiate
    const newClientSoldeR = await sql(`SELECT solde::float as solde FROM comptes WHERE id=$1`, clientC.id).then(r=>r[0]?.solde||0).catch(()=>null)
    return ok(res, {id:txId, reference:ref, type:'retrait', montant:amt, frais, total, gainAgent, clientId:client.id, clientSolde:newClientSoldeR})
  } catch (e) { return err(res, e.message, 500) }
})

// Transfert — tous
app.post('/api/v1/transactions/transfer', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant, motif } = req.body; const amt=Number(montant)
    if (!amt||amt<=0) return err(res,'Montant invalide')
    // Compte source
    const srcRows = await sql(
      `SELECT c.id, c.solde, u.id as uid FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id WHERE u.id=$1 LIMIT 1`,
      toUUID(req.user.id)
    )
    if (!srcRows.length) return err(res,'Compte source introuvable',404)
    const srcC = srcRows[0]
    if (Number(srcC.solde)<amt) return err(res,'Solde insuffisant')
    // Recherche flexible : avec ou sans indicatif +225
    const telClean = telephone.replace(/^\+225/, '').replace(/\s/g,'')
    const dstRows = await sql(
      `SELECT c.id as cid, u.id as uid, u.prenom, u.nom, u.telephone, u.parrain_id as "parrainId"
       FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id
       WHERE u.telephone=$1 OR u.telephone=$2 OR u.telephone=$3 LIMIT 1`,
      telephone, telClean, '+225'+telClean
    )
    // Règles de transfert :
    // client → client uniquement
    // agent/mini_master/master/superviseur/backoffice → entre professionnels uniquement
    const PROS = ['agent','mini_master','master','superviseur','backoffice','super_backoffice']
    const srcRole = req.user.role || 'client'
    const isSrcPro = PROS.includes(srcRole)
    const isSrcClient = srcRole === 'client'

    if (dstRows.length) {
      const dstRoleRows = await sql(
        `SELECT role FROM utilisateurs WHERE id = $1 LIMIT 1`, dstRows[0].uid
      )
      const dstRole = dstRoleRows[0]?.role || 'client'
      const isDstPro = PROS.includes(dstRole)
      const isDstClient = dstRole === 'client'

      // Client ne peut transférer qu'à un autre client
      if (isSrcClient && !isDstClient) {
        return err(res, "Un client ne peut transférer qu’à un autre client.", 400)
      }
      // Professionnel ne peut transférer qu'à un autre professionnel
      if (isSrcPro && !isDstPro) {
        return err(res, 'Les transferts entre professionnels et clients ne sont pas autorisés.', 400)
      }
      // Business ne transfère pas (utilise paiement marchand)
      if (srcRole === 'business') {
        return err(res, 'Les comptes Business utilisent le système de paiement marchand.', 400)
      }
    }
    if (!dstRows.length) {
      // Vérifier si l'utilisateur existe sans compte
      const userRows = await sql(
        `SELECT id, prenom, nom, telephone FROM utilisateurs WHERE telephone=$1 OR telephone=$2 OR telephone=$3 LIMIT 1`,
        telephone, telClean, '+225'+telClean
      )
      if (!userRows.length) return err(res,'Destinataire introuvable',404)
      // Créer le compte manquant
      const newCid = require('crypto').randomUUID()
      await pgPool.query(
        `INSERT INTO comptes (id, utilisateur_id, solde, plafond_mensuel, type_compte, created_at, updated_at)
         VALUES ($1, $2, 0, 20000, 'client', NOW(), NOW())`,
        [newCid, userRows[0].id]
      )
      // Relancer la recherche
      const dstRows2 = await sql(
        `SELECT c.id as cid, u.id as uid, u.prenom, u.nom, u.telephone, u.parrain_id as "parrainId"
         FROM comptes c JOIN utilisateurs u ON u.id=c.utilisateur_id
         WHERE u.id=$1 LIMIT 1`, userRows[0].id
      )
      if (!dstRows2.length) return err(res,'Erreur création compte destinataire',500)
      dstRows.push(dstRows2[0])
    }
    const dstC = dstRows[0]
    const ref='TRF-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,date_creation)
       VALUES ($1,$2,'transfert','complete',$3,$4,$5,0,NOW())`,
      [txId, ref, srcC.id, dstC.cid, amt]
    )
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id = $2`, [amt, srcC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id = $2`, [amt, dstC.cid])
    verifierRattachement(dstC.uid, 'transfert_recu', amt).catch(()=>{})
    await notifier(toUUID(req.user.id),'transaction','📤 Transfert envoyé',
      `Vous avez envoyé ${amt.toLocaleString('fr-FR')} F CFA.`,{montant:amt,reference:ref,type:'transfert_envoye'})
    await notifier(dstC.uid,'transaction','📥 Argent reçu',
      `Vous avez reçu ${amt.toLocaleString('fr-FR')} F CFA.`,{montant:amt,reference:ref,type:'transfert_recu'})
    return ok(res,{id:txId,reference:ref,type:'transfert',montant:amt})
  } catch (e) { return err(res, e.message, 500) }
})

// Paiement marchand
app.post('/api/v1/transactions/pay', authMiddleware, async (req, res) => {
  try {
    const { merchantCode, montant } = req.body; const amt=Number(montant)
    const srcRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const srcC = srcRows[0] ? { id: srcRows[0].id, solde: srcRows[0].solde } : null
    if (!srcC||srcC.solde<amt) return err(res, 'Solde insuffisant')
    const merchantRows = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id WHERE u.code_parrainage=$1 AND u.role='business' GROUP BY u.id LIMIT 1`, merchantCode
    )
    const merchant = merchantRows[0] || null
    if (!merchant) return err(res, 'Marchand introuvable', 404)
    if (!merchant.comptes?.length) return err(res, 'Compte marchand introuvable', 404)
    const mC=merchant.comptes[0]; const frais=Math.round(amt*0.008); const ref='PAY-'+Date.now().toString(36).toUpperCase()
    const payTxId = require('crypto').randomUUID()
    await pgPool.query(`INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,date_creation) VALUES ($1,$2,'paiement_marchand','complete',$3,$4,$5,$6,NOW())`,
      [payTxId, ref, srcC.id, mC.id, amt, frais])
    await pgPool.query(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, [amt, srcC.id])
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, [amt-frais, mC.id])
    const tx = { id: payTxId, reference: ref, montant: amt, frais, type: 'paiement_marchand' }
    // Commission parrain : 10% des frais si le client payeur est rattaché
    if (req.user.parrainId) {
      sql(
        `SELECT id FROM rattachements WHERE filleul_id = $1 AND statut = 'valide'`,
        toUUID(req.user.id)
      ).then(async rows => {
        if (!rows || !rows.length) return
        const gainParrain = Math.round(frais * 0.10)
        if (gainParrain < 1) return
        const cpId = require('crypto').randomUUID()
        await pgPool.query(
          `INSERT INTO commissions (id,beneficiaire_id,type_commission,montant,taux,statut,date_calcul)
           VALUES ($1,$2,'parrainage',$3,0.10,'verse',NOW())`,
          [cpId, req.user.parrainId, gainParrain]
        )
        await pgPool.query(
          `UPDATE comptes SET solde=solde+$1 WHERE utilisateur_id = $2`,
          [gainParrain, req.user.parrainId]
        )
        console.log('[PARRAIN PAY] +' + gainParrain + ' FCFA → parrain:', req.user.parrainId)
      }).catch(e => console.warn('[PARRAIN PAY]', e.message))
    }
    // Notif client payeur
    await notifier(toUUID(req.user.id), 'transaction', '🛒 Paiement effectué',
      `Paiement de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès.`,
      { montant:amt, reference:ref, type:'paiement_envoye' }
    )
    // Notif marchand
    await notifier(merchant.id, 'transaction', '💳 Paiement reçu',
      `Vous avez reçu un paiement de ${amt.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, reference:ref, type:'paiement_recu' }
    )
    return ok(res, tx)
  } catch (e) { return err(res, e.message, 500) }
})

// Forcer statut transaction — admin et support_tech
// ═══ ENREGISTRER TOKEN FCM ═══
app.post('/api/v1/users/fcm-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return err(res, 'Token manquant')
    await pgPool.query(
      `UPDATE utilisateurs SET fcm_token=$1 WHERE id=$2`,
      [token, toUUID(req.user.id)]
    )
    return ok(res, { success: true })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ GET transaction by id ═══
app.get('/api/v1/transactions/:id', authMiddleware, async (req, res) => {
  try {
    const rows = await sql(
      `SELECT t.id::text as id, t.reference, t.type, t.statut, t.montant::float as montant,
              t.frais::float as frais, t.date_creation as "dateCreation",
              t.compte_source_id::text as "compteSourceId", t.compte_dest_id::text as "compteDestId",
              us.prenom as "srcPrenom", us.nom as "srcNom", us.telephone as "srcTel",
              ud.prenom as "destPrenom", ud.nom as "destNom", ud.telephone as "destTel"
       FROM transactions t
       LEFT JOIN comptes cs ON cs.id = t.compte_source_id
       LEFT JOIN utilisateurs us ON us.id = cs.utilisateur_id
       LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
       LEFT JOIN utilisateurs ud ON ud.id = cd.utilisateur_id
       WHERE t.id::text = $1 LIMIT 1`, req.params.id
    )
    if (!rows.length) return err(res, 'Transaction introuvable', 404)
    return ok(res, rows[0])
  } catch(e) { return err(res, e.message, 500) }
})

app.patch('/api/v1/transactions/:id/status', authMiddleware, role(...SUPPORT_TECH), async (req, res) => {
  try {
    const txSRows = await sql(`UPDATE transactions SET statut=$1 WHERE id=$2 RETURNING id::text as id, reference, type, statut, montant::float as montant`, req.body.statut, req.params.id)
    return ok(res, txSRows[0] || {})
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ REMBOURSEMENT — support_client et admin ═══
// Peut rembourser le dernier transfert OU un transfert spécifique par transactionId
app.post('/api/v1/transactions/refund', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, transactionId } = req.body
    if (!userId) return err(res, 'userId requis')

    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, userId)
    const compte = compteRows[0] || null
    if (!compte) return err(res, 'Compte introuvable', 404)

    let tx = null

    if (transactionId) {
      // Remboursement d'une transaction spécifique
      const txFRows = await sql(`SELECT id::text as id, type, statut, montant::float as montant, compte_source_id as "compteSourceId", compte_dest_id as "compteDestId", date_creation as "dateCreation", reference FROM transactions WHERE id=$1 LIMIT 1`, transactionId)
      tx = txFRows[0] || null
      if (!tx) return err(res, 'Transaction introuvable', 404)
      if (tx.type !== 'transfert') return err(res, 'Seuls les transferts sont remboursables')
      if (tx.statut !== 'complete') return err(res, 'Cette transaction ne peut pas être remboursée')
      // Vérifier que le client est impliqué dans la transaction (source ou dest)
      if (tx.compteSourceId !== compte.id && tx.compteDestId !== compte.id) {
        return err(res, 'Cette transaction ne concerne pas ce client')
      }
      // Pour rembourser : toujours remettre l argent au compte source original
      // Si le client est la source → rembourser vers lui (récupérer depuis dest)
      // Si le client est la dest → pas de remboursement possible depuis ce côté
      // Délai 7 jours
      const limite = new Date(Date.now() - 7*24*60*60*1000)
      if (tx.dateCreation < limite) return err(res, 'Délai de remboursement dépassé (7 jours maximum)')
    } else {
      // Dernier transfert dans les 7 jours
      const limite = new Date(Date.now() - 7*24*60*60*1000)
      const txLastRows = await sql(`SELECT id::text as id, type, statut, montant::float as montant, compte_source_id as "compteSourceId", compte_dest_id as "compteDestId", date_creation as "dateCreation", reference FROM transactions WHERE compte_source_id=$1 AND type='transfert' AND statut='complete' AND date_creation>=$2::timestamptz ORDER BY date_creation DESC LIMIT 1`, compte.id, limite)
      tx = txLastRows[0] || null
      if (!tx) return err(res, 'Aucun transfert remboursable dans les 7 derniers jours', 404)
    }

    // Vérifier que le destinataire a les fonds
    const destCRows = await sql(`SELECT id::text as id, solde::float as solde FROM comptes WHERE id=$1 LIMIT 1`, tx.compteDestId)
    const destCompte = destCRows[0] || null
    if (!destCompte) return err(res, 'Compte destinataire introuvable')
    const ref = 'RMB-'+Date.now().toString(36).toUpperCase()
    // Utiliser SQL brut pour éviter les problèmes de schéma Prisma
    const newId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO transactions (id, reference, type, statut, compte_source_id, compte_dest_id, montant, frais, date_creation)
       VALUES ($1, $2, 'transfert', 'complete', $3, $4, $5, 0, NOW())`,
      [newId, ref, tx.compteDestId, tx.compteSourceId, tx.montant]
    )
    await pgPool.query(
      `UPDATE comptes SET solde = solde - $1 WHERE id = $2`,
      [tx.montant, tx.compteDestId]
    )
    await pgPool.query(
      `UPDATE comptes SET solde = solde + $1 WHERE id = $2`,
      [tx.montant, tx.compteSourceId]
    )
    await pgPool.query(
      `UPDATE transactions SET statut = 'annule' WHERE id = $1`,
      [tx.id]
    )
    return ok(res, { message: 'Remboursement effectué', montant: tx.montant, reference: ref, transactionOrigine: tx.reference })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ SUSPENDRE DESTINATAIRE — support_client peut suspendre temporairement ═══
app.patch('/api/v1/users/:id/suspend', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { motif } = req.body
    const suspRows = await sql(`UPDATE utilisateurs SET statut='suspendu', updated_at=NOW() WHERE id=$1 RETURNING id::text as id, prenom, nom, telephone, statut`, req.params.id)
    const user = suspRows[0] || {id:req.params.id}
    // Créer un ticket d'enquête automatique
    const ref_s = 'TKT-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, service, priorite, client_id, date_creation)
       VALUES (gen_random_uuid(), $1, 'Suspension preventive - Enquete remboursement', $2, 'en_cours', 'support_client', 'normal', $3, NOW())`,
      [ref_s, motif || 'Compte suspendu suite a demande de remboursement. Enquete en cours.', req.params.id]
    ).catch(() => {})
    // Notification suspension
    await notifier(req.params.id, 'securite', '⚠️ Compte suspendu',
      motif || 'Votre compte AFRIM PAY a été suspendu temporairement. Soumettez des documents valides pour réactivation.',
      { statut: 'suspendu', motif: motif || null }
    )
    return ok(res, { message: 'Compte suspendu', user })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ COMMISSIONS ═══
app.get('/api/v1/commissions/summary', authMiddleware, async (req, res) => {
  try {
    const uid = toUUID(req.user.id)
    const isAdmin = ADMIN_SUP.includes(req.user.role)
    const now = new Date()
    const debut = new Date(now.getFullYear(), now.getMonth(), 1)
    const whereClause = isAdmin ? '' : 'WHERE beneficiaire_id = $1'
    const params = isAdmin ? [] : [uid]
    const [t, m] = await Promise.all([
      sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions ${whereClause}`, ...params),
      sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions ${whereClause ? whereClause + ' AND date_calcul >= $' + (params.length+1) + '::timestamptz' : 'WHERE date_calcul >= $1::timestamptz'}`, ...params, debut)
    ])
    return ok(res, { totalHistorique: t[0]?.total||0, totalMois: m[0]?.total||0 })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ STATS ═══
app.get('/api/v1/stats/dashboard', authMiddleware, async (req, res) => {
  try {
    const now=new Date(); const debut=new Date(now.getFullYear(),now.getMonth(),1)
    const cRows = await sql(`SELECT id::text, solde::float FROM comptes WHERE utilisateur_id = $1 LIMIT 1`, toUUID(req.user.id))
    const c = cRows[0] ? { id: cRows[0].id, solde: cRows[0].solde } : null
    const bw=c?{OR:[{compteSourceId:c.id},{compteDestId:c.id}]}:{}
    const canSeeGlobal = ADMIN_SUP.includes(req.user.role) || req.user.role === 'support_tech'
    const toUUID_g = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const gainsSql = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id = $1 AND date_calcul >= $2::timestamptz`,
      toUUID_g(toUUID(req.user.id)), debut
    )
    // Raw SQL pour éviter TypeTransaction enum
    const toUUID_d = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const cId = c ? toUUID_d(c.id) : null
    const aujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const [depR, retR, txJR] = await Promise.all([
      cId ? sql(`SELECT COUNT(*)::int as n FROM transactions WHERE compte_dest_id = $1 AND type='depot' AND date_creation >= $2::timestamptz`, cId, debut) : [{n:0}],
      cId ? sql(`SELECT COUNT(*)::int as n FROM transactions WHERE compte_source_id = $1 AND type='retrait' AND date_creation >= $2::timestamptz`, cId, debut) : [{n:0}],
      cId ? sql(`SELECT COUNT(*)::int as n FROM transactions WHERE (compte_source_id = $1 OR compte_dest_id = $1) AND date_creation >= $2::timestamptz`, cId, aujourdhui) : [{n:0}]
    ])
    const dep = depR[0]?.n || 0
    const ret = retR[0]?.n || 0
    const txJ = txJR[0]?.n || 0
    const [users, alertes, tickets] = await Promise.all([
      canSeeGlobal ? sql(`SELECT COUNT(*)::int as n FROM utilisateurs`).then(r=>r[0]?.n||0).catch(()=>0) : Promise.resolve(0),
      canSeeGlobal ? sql(`SELECT COUNT(*)::int as n FROM alertes_fraude WHERE statut='active'`).then(r=>r[0]?.n||0).catch(()=>0) : Promise.resolve(0),
      canSeeGlobal ? sql(`SELECT COUNT(*)::int as n FROM tickets_support WHERE statut='ouvert'`).then(r=>r[0]?.n||0).catch(()=>0) : Promise.resolve(0)
    ])
    return ok(res, {depotsMois:{count:dep},retraitsMois:{count:ret},gainsMois:gainsSql[0]?.total||0,txJour:txJ,totalUtilisateurs:users,alertesActives:alertes,ticketsOuverts:tickets})
  } catch (e) { return err(res, e.message, 500) }
})

// Overview admin
app.get('/api/v1/admin/overview', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const [users,txns,alertes] = await Promise.all([
      sql(`SELECT COUNT(*)::int as n FROM utilisateurs`).then(r=>r[0]?.n||0),
      sql(`SELECT COUNT(*)::int as n FROM transactions`).then(r=>r[0]?.n||0),
      sql(`SELECT COUNT(*)::int as n FROM alertes_fraude WHERE statut='active'`).then(r=>r[0]?.n||0).catch(()=>0)
    ])
    const commRows = await sql(`SELECT COALESCE(SUM(montant),0)::float as total FROM commissions`)
    return ok(res, { users, txns, totalCommissions: commRows[0]?.total||0, alertes })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ RATTACHEMENTS — visibilité et gestion réservées à admin + backoffice ═══
// Les agents ne voient JAMAIS leurs filleuls rattachés (anti-démarchage).
// Seul le back-office a une vue complète + droit de rattacher/détacher manuellement.

// Liste complète des rattachements (parrain ↔ filleul) avec recherche optionnelle
app.get('/api/v1/admin/rattachements', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const search = (req.query.search || '').trim()
    const statut = req.query.statut || null // 'valide' | 'en_cours' | null (tous)
    let q = `
      SELECT
        r.id::text as id, r.statut, r.date_entree::text as "dateEntree", r.date_sortie::text as "dateSortie", r.created_at::text as "createdAt",
        r.parrain_id as "parrainIdRaw", r.filleul_id as "filleulIdRaw",
        p.id::text as "parrainId", p.prenom as "parrainPrenom", p.nom as "parrainNom", p.telephone as "parrainTelephone", p.role as "parrainRole",
        f.id::text as "filleulId", f.prenom as "filleulPrenom", f.nom as "filleulNom", f.telephone as "filleulTelephone", f.kyc_niveau as "filleulKyc"
      FROM rattachements r
      LEFT JOIN utilisateurs p ON p.id::text = r.parrain_id::text
      LEFT JOIN utilisateurs f ON f.id::text = r.filleul_id::text
      WHERE 1=1`
    const params = []
    if (statut) { params.push(statut); q += ` AND r.statut = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      q += ` AND (p.telephone ILIKE $${params.length} OR f.telephone ILIKE $${params.length} OR p.nom ILIKE $${params.length} OR f.nom ILIKE $${params.length} OR p.prenom ILIKE $${params.length} OR f.prenom ILIKE $${params.length})`
    }
    q += ` ORDER BY r.created_at DESC LIMIT 1000`
    const rows = await sql(q, ...params)
    // Signaler les rattachements orphelins (parrain ou filleul introuvable en base) pour diagnostic
    const orphelins = rows.filter(r => !r.parrainId || !r.filleulId)
    if (orphelins.length > 0) {
      console.warn(`[RATTACHEMENTS] ${orphelins.length} rattachement(s) orphelin(s) détecté(s):`, orphelins.map(o => ({id:o.id, parrainIdRaw:o.parrainIdRaw, filleulIdRaw:o.filleulIdRaw})))
    }
    return ok(res, { rattachements: rows, total: rows.length, orphelins: orphelins.length })
  } catch (e) { return err(res, e.message, 500) }
})

// Vue détaillée pour un utilisateur précis : son parrain + la liste de ses filleuls rattachés
app.get('/api/v1/admin/rattachements/:userId', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const userId = req.params.userId
    const parrainRows = await sql(`
      SELECT r.id::text as id, r.statut, r.date_entree::text as "dateEntree",
        p.id::text as "parrainId", p.prenom as "parrainPrenom", p.nom as "parrainNom", p.telephone as "parrainTelephone", p.role as "parrainRole"
      FROM rattachements r LEFT JOIN utilisateurs p ON p.id::text = r.parrain_id::text
      WHERE r.filleul_id = $1`, userId)
    const filleulsRows = await sql(`
      SELECT r.id::text as id, r.statut, r.date_entree::text as "dateEntree",
        f.id::text as "filleulId", f.prenom as "filleulPrenom", f.nom as "filleulNom", f.telephone as "filleulTelephone", f.kyc_niveau as "filleulKyc"
      FROM rattachements r LEFT JOIN utilisateurs f ON f.id::text = r.filleul_id::text
      WHERE r.parrain_id = $1 ORDER BY r.created_at DESC`, userId)
    return ok(res, { parrain: parrainRows[0] || null, filleuls: filleulsRows })
  } catch (e) { return err(res, e.message, 500) }
})

// Recherche d'un parrain par téléphone : retourne ses infos + liste complète de ses filleuls + compte exact
app.get('/api/v1/admin/rattachements/par-telephone', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const telephone = (req.query.telephone || '').trim()
    console.log('[PAR-TELEPHONE] requête reçue, query brut:', JSON.stringify(req.query), '| telephone extrait:', JSON.stringify(telephone), '| user:', req.user.telephone, req.user.role)
    if (!telephone) return err(res, 'telephone requis', 400)
    const parrainRows = await sql(`SELECT id::text as id, prenom, nom, telephone, role, kyc_niveau as "kycNiveau" FROM utilisateurs WHERE telephone = $1 LIMIT 1`, telephone)
    console.log('[PAR-TELEPHONE] résultat sql():', JSON.stringify(parrainRows))
    const parrain = parrainRows[0] || null
    if (!parrain) {
      console.warn('[RATTACHEMENTS] par-telephone: aucun utilisateur trouvé pour', JSON.stringify(telephone))
      return err(res, 'Aucun utilisateur trouvé avec ce numéro', 404)
    }
    const filleulsRows = await sql(`
      SELECT r.id::text as id, r.statut, r.date_entree::text as "dateEntree",
        f.id::text as "filleulId", f.prenom as "filleulPrenom", f.nom as "filleulNom", f.telephone as "filleulTelephone", f.kyc_niveau as "filleulKyc", f.role as "filleulRole"
      FROM rattachements r LEFT JOIN utilisateurs f ON f.id::text = r.filleul_id::text
      WHERE r.parrain_id = $1 ORDER BY r.created_at DESC`, parrain.id)
    return ok(res, { parrain, filleuls: filleulsRows, total: filleulsRows.length })
  } catch (e) { return err(res, e.message, 500) }
})

// Liste des comptes n'ayant AUCUN filleul rattaché (pour relance commerciale)
// Inclut tous les rôles (client compris, puisqu'un client peut aussi être parrain)
app.get('/api/v1/admin/rattachements/sans-filleul', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    const search = (req.query.search || '').trim()
    const roleFilter = req.query.role || null
    console.log('[SANS-FILLEUL] requête reçue, query:', JSON.stringify(req.query), '| user:', req.user.telephone, req.user.role)
    // Étape 1 : récupérer les IDs des parrains actifs (requête légère, sans jointure)
    const parrainsActifs = await sql(`SELECT DISTINCT parrain_id FROM rattachements WHERE statut = 'valide' AND parrain_id IS NOT NULL`)
    const parrainsActifsSet = new Set(parrainsActifs.map(r => String(r.parrain_id)))
    console.log('[SANS-FILLEUL] parrains actifs trouvés:', parrainsActifs.length)
    // Étape 2 : récupérer les utilisateurs (avec filtres simples) puis exclure les parrains actifs en mémoire
    let q = `SELECT id::text as id, prenom, nom, telephone, role, statut, kyc_niveau as "kycNiveau", created_at::text as "createdAt" FROM utilisateurs WHERE 1=1`
    const params = []
    if (roleFilter) { params.push(roleFilter); q += ` AND role = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      q += ` AND (telephone ILIKE $${params.length} OR nom ILIKE $${params.length} OR prenom ILIKE $${params.length})`
    }
    q += ` ORDER BY created_at DESC LIMIT 1000`
    const allRows = await sql(q, ...params)
    console.log('[SANS-FILLEUL] total utilisateurs (avant filtre):', allRows.length)
    const rows = allRows.filter(u => !parrainsActifsSet.has(String(u.id))).slice(0, 500)
    console.log('[SANS-FILLEUL] après exclusion parrains actifs:', rows.length)
    return ok(res, { utilisateurs: rows, total: rows.length })
  } catch (e) {
    console.error('[SANS-FILLEUL] ERREUR:', e.message, e.stack)
    return err(res, e.message, 500)
  }
})

// Détacher un filleul de son parrain — action réservée à backoffice (Super Back-office y compris, même rôle)
// Admin a uniquement la lecture, pas l'action.
app.post('/api/v1/admin/rattachements/detacher', authMiddleware, roleBackofficeOuSuperAdmin, async (req, res) => {
  try {
    const { filleulId } = req.body
    if (!filleulId) return err(res, 'filleulId requis', 400)
    const existing = await sql(`SELECT r.*, f.prenom, f.nom, f.telephone FROM rattachements r JOIN utilisateurs f ON f.id::text=r.filleul_id WHERE r.filleul_id = $1`, filleulId).then(r => r[0] || null)
    if (!existing) return err(res, 'Rattachement introuvable', 404)
    await pgPool.query(`DELETE FROM rattachements WHERE filleul_id = $1`, [filleulId])
    await logAction(req.user, 'detachement_rattachement', { id: filleulId, prenom: existing.prenom, nom: existing.nom, telephone: existing.telephone, role: 'client' }, `Détaché du parrain ${existing.parrain_id}`)
    return ok(res, { message: 'Filleul détaché avec succès' })
  } catch (e) { return err(res, e.message, 500) }
})

// Rattacher manuellement un filleul à un parrain — action réservée à backoffice (Super Back-office y compris)
app.post('/api/v1/admin/rattachements/rattacher', authMiddleware, roleBackofficeOuSuperAdmin, async (req, res) => {
  try {
    const { filleulId, parrainId } = req.body
    if (!filleulId || !parrainId) return err(res, 'filleulId et parrainId requis', 400)
    if (filleulId === parrainId) return err(res, 'Un utilisateur ne peut pas être son propre parrain', 400)
    const [filleul, parrain] = await Promise.all([
      sql(`SELECT id::text as id, prenom, nom, telephone FROM utilisateurs WHERE id = $1`, filleulId).then(r => r[0]),
      sql(`SELECT id::text as id, prenom, nom, telephone FROM utilisateurs WHERE id = $1`, parrainId).then(r => r[0])
    ])
    if (!filleul) return err(res, 'Filleul introuvable', 404)
    if (!parrain) return err(res, 'Parrain introuvable', 404)

    const existing = await sql(`SELECT statut FROM rattachements WHERE filleul_id = $1`, filleulId).then(r => r[0] || null)
    if (existing) {
      await pgPool.query(
        `UPDATE rattachements SET parrain_id=$1, statut='valide', date_entree=NOW(), date_sortie=NULL WHERE filleul_id=$2`,
        [parrainId, filleulId]
      )
    } else {
      await pgPool.query(
        `INSERT INTO rattachements (id, parrain_id, filleul_id, date_entree, statut, created_at)
         VALUES ($1,$2,$3,NOW(),'valide',NOW())`,
        [require('crypto').randomUUID(), parrainId, filleulId]
      )
    }
    await pgPool.query(`UPDATE utilisateurs SET parrain_id=$1 WHERE id=$2`, [parrainId, filleulId]).catch(()=>{})
    await logAction(req.user, 'rattachement_manuel', filleul, `Rattaché manuellement au parrain ${parrain.telephone}`)
    return ok(res, { message: 'Rattachement effectué avec succès' })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ ALERTES — admin, superviseur, support_tech ═══
// ══════════════════════════════════════════════
// ALERTES CENTRALISÉES — Routes complètes
// ══════════════════════════════════════════════

// Mapping service → rôles autorisés à voir
const ALERTE_SERVICE_ROLES = {
  support_client:  ['admin','backoffice','support_client'],
  support_tech:    ['admin','backoffice','support_tech'],
  superviseur:     ['admin','backoffice','superviseur'],
  backoffice:      ['admin','backoffice'],
  admin:           ['admin','backoffice'],
}

function canSeeAlerte(userRole, service) {
  if (userRole === 'admin' || userRole === 'backoffice') return true
  const allowed = ALERTE_SERVICE_ROLES[service] || ['admin']
  return allowed.includes(userRole)
}

function getServicesForRole(userRole) {
  if (userRole === 'admin' || userRole === 'backoffice') return null // all
  return Object.keys(ALERTE_SERVICE_ROLES).filter(s => ALERTE_SERVICE_ROLES[s].includes(userRole))
}

// GET /alerts — liste filtrée selon rôle
app.get('/api/v1/alerts', authMiddleware, async (req, res) => {
  try {
    const { statut, gravite, service, limit=30 } = req.query
    const userRole = req.user.role
    const services = getServicesForRole(userRole)
    let where = 'WHERE 1=1'
    const params = []
    let pi = 1
    // Toujours filtrer par les services autorisés selon le rôle
    if (services) {
      // Si un service spécifique est demandé ET qu'il est dans la liste autorisée
      if (service && services.includes(service)) {
        where += ` AND service = $${pi}`
        params.push(service); pi++
      } else {
        where += ` AND service = ANY($${pi}::text[])`
        params.push(services); pi++
      }
    } else if (service) {
      // Admin/backoffice peut filtrer par service spécifique
      where += ` AND service = $${pi}`
      params.push(service); pi++
    }
    if (statut) { where += ` AND statut = $${pi}`; params.push(statut); pi++ }
    if (gravite) { where += ` AND gravite = $${pi}`; params.push(gravite); pi++ }
    where += ` ORDER BY created_at DESC LIMIT $${pi}`
    params.push(parseInt(limit)||30)
    const list = await sql(
      `SELECT id, titre, description, gravite, service, statut, auteur, auteur_role, traite_par, resolution, created_at::text, updated_at::text FROM alertes ${where}`,
      ...params
    )
    // Compter les alertes ouvertes par service pour le rôle
    const servicesForCount = services || Object.keys(ALERTE_SERVICE_ROLES)
    const countsRaw = await sql(
      `SELECT service, COUNT(*)::int as n FROM alertes WHERE statut IN ('ouverte','en_cours') AND service = ANY($1::text[]) GROUP BY service`,
      servicesForCount
    )
    const counts = {}
    countsRaw.forEach(r => { counts[r.service] = r.n })
    return ok(res, { alertes: list, counts })
  } catch(e) { return err(res, e.message, 500) }
})

// POST /alerts — créer une alerte
app.post('/api/v1/alerts', authMiddleware, role('admin','superviseur','support_client','support_tech','backoffice'), async (req, res) => {
  try {
    const { titre, description, gravite='moyenne', service='admin' } = req.body
    if (!titre || !description) return err(res, 'titre et description requis', 400)
    const validGravites = ['faible','moyenne','elevee','critique']
    const validServices = ['support_client','support_tech','superviseur','backoffice','admin']
    const g = validGravites.includes(gravite) ? gravite : 'moyenne'
    const s = validServices.includes(service) ? service : 'admin'
    const a = await sql(
      `INSERT INTO alertes (titre, description, gravite, service, auteur, auteur_role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, titre, description, gravite, service, statut, auteur, created_at::text`,
      titre, description, g, s,
      (req.user.prenom||req.user.telephone||req.user.role),
      req.user.role
    )
    await logAction(req.user, 'alerte_creee', {id:'',prenom:'',nom:'',role:s,telephone:''},
      '['+g.toUpperCase()+'] '+titre+' — '+description.slice(0,60))
    return ok(res, a[0], 201)
  } catch(e) { return err(res, e.message, 500) }
})

// PATCH /alerts/:id — changer statut / ajouter résolution
app.patch('/api/v1/alerts/:id', authMiddleware, role('admin','superviseur','support_client','support_tech','backoffice'), async (req, res) => {
  try {
    const { statut, resolution, traite_par } = req.body
    const validStatuts = ['ouverte','en_cours','resolue','fermee']
    const updates = []
    const params = []
    let pi = 1
    if (statut && validStatuts.includes(statut)) { updates.push(`statut=$${pi}`); params.push(statut); pi++ }
    if (resolution !== undefined) { updates.push(`resolution=$${pi}`); params.push(resolution); pi++ }
    if (traite_par) { updates.push(`traite_par=$${pi}`); params.push(traite_par); pi++ }
    updates.push(`updated_at=NOW()`)
    if (!updates.length) return err(res, 'rien à modifier', 400)
    params.push(req.params.id)
    const a = await sql(
      `UPDATE alertes SET ${updates.join(',')} WHERE id=$${pi} RETURNING id, titre, statut, gravite, service, updated_at::text`,
      ...params
    )
    if (!a.length) return err(res, 'Alerte introuvable', 404)
    return ok(res, a[0])
  } catch(e) { return err(res, e.message, 500) }
})

// DELETE /alerts/:id — admin seulement
app.delete('/api/v1/alerts/:id', authMiddleware, role('admin'), async (req, res) => {
  try {
    await pgPool.query("DELETE FROM alertes WHERE id = $1", [req.params.id])
    return ok(res, { message: 'Alerte supprimée' })
  } catch(e) { return err(res, e.message, 500) }
})

// GET /alerts/counts — compteurs par service (pour badges)
app.get('/api/v1/alerts/counts', authMiddleware, async (req, res) => {
  try {
    const services = getServicesForRole(req.user.role) || Object.keys(ALERTE_SERVICE_ROLES)
    const rows = await sql(
      `SELECT service, COUNT(*)::int as n FROM alertes WHERE statut IN ('ouverte','en_cours') AND service = ANY($1::text[]) GROUP BY service`,
      services
    )
    const counts = {}
    rows.forEach(r => { counts[r.service] = r.n })
    return ok(res, { counts })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══════════════════════════════════════════════════════
// STATS DÉTAILLÉES — agrégation par rôle, période, direction
// GET /api/v1/stats/detailed?role=agent&period=month
// ═══════════════════════════════════════════════════════
app.get('/api/v1/stats/detailed', authMiddleware, role('admin','backoffice','superviseur','agent','mini_master','master'), async (req, res) => {
  try {
    const { role: targetRole = 'agent', period = 'month' } = req.query

    // Calcul de la date de début selon la période
    const now = new Date()
    let debut
    if (period === 'day' || period === 'today') {
      debut = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      const dow = now.getDay()
      debut = new Date(now); debut.setDate(debut.getDate() - dow); debut.setHours(0,0,0,0)
    } else if (period === 'year') {
      debut = new Date(now.getFullYear(), 0, 1)
    } else { // month (défaut)
      debut = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    const debutStr = debut.toISOString()

    // 1. Pour un agent/mini_master/master : utiliser le user connecté uniquement
    // Pour admin/backoffice/superviseur : récupérer tous les users du rôle cible
    const isSelfRole = ['agent','mini_master','master'].includes(req.user.role)
    let users
    if (isSelfRole) {
      users = await sql(
        `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.zone,
                COALESCE(c.solde,0) as solde, c.id as compte_id
         FROM utilisateurs u
         LEFT JOIN comptes c ON c.utilisateur_id = u.id
         WHERE u.id = $1 LIMIT 1`,
        toUUID(req.user.id)
      )
    } else {
      users = await sql(
        `SELECT u.id, u.prenom, u.nom, u.telephone, u.role, u.statut, u.zone,
                COALESCE(c.solde,0) as solde, c.id as compte_id
         FROM utilisateurs u
         LEFT JOIN comptes c ON c.utilisateur_id = u.id
         WHERE u.role = $1
         ORDER BY u.created_at DESC`,
        targetRole
      )
    }

    if (!users.length) return ok(res, { users: [], totaux: {}, courbe: [], periode: period, debut: debutStr })

    // Forcer les IDs en strings pures (Prisma peut retourner des objets)
    users.forEach(u => {
      u.id = String(u.id || '')
      u.compte_id = u.compte_id ? String(u.compte_id) : null
    })
    const compteIds = users.map(u => u.compte_id).filter(Boolean)
    const userByCompte = {}
    users.forEach(u => { if (u.compte_id) userByCompte[u.compte_id] = u.id })

    // 2. Requête transactions sur la période selon la logique métier par rôle
    let txSQL = ''
    let txParams = [debutStr]

    if (targetRole === 'agent') {
      // Agents : dépôts (agentId), retraits (agentId), transferts (source OU dest)
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as compte_source_id, t.compte_dest_id as compte_dest_id,
               t.agent_id as "agentId", t.initiateur_role as "initiateurRole",
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (
            (t.type IN ('depot','retrait') AND t.agent_id::text = ANY($2::text[]))
            OR (t.type = 'transfert' AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[])))
          )
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else if (targetRole === 'business') {
      // Business : paiements reçus (compteDestId), transferts envoyés/reçus, paiements entre business
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as compte_source_id, t.compte_dest_id as compte_dest_id,
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
          AND t.type IN ('paiement_marchand','transfert')
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else if (targetRole === 'mini_master' || targetRole === 'master') {
      // Mini-Master/Master : tous les transferts (source/dest) + commissions reçues
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as compte_source_id, t.compte_dest_id as compte_dest_id,
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
          AND t.type IN ('transfert','depot','retrait')
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else if (targetRole === 'client') {
      // Clients : dépôts reçus, retraits, transferts, paiements marchands
      txSQL = `
        SELECT t.id, t.type, t.montant::float, t.frais::float, t.date_creation as date_creation,
               t.compte_source_id as compte_source_id, t.compte_dest_id as compte_dest_id,
               t.statut
        FROM transactions t
        WHERE t.date_creation >= $1::timestamptz
          AND t.statut = 'complete'
          AND (t.compte_source_id::text = ANY($2::text[]) OR t.compte_dest_id::text = ANY($2::text[]))
        ORDER BY t.date_creation DESC
        LIMIT 2000`
      txParams.push(compteIds)
    } else {
      return ok(res, { users: [], totaux: {}, courbe: [] })
    }

    const txns = await sql(txSQL, ...txParams)

    // 3. Calculer les stats par utilisateur avec distinction envoyé/reçu
    const userStats = {}
    users.forEach(u => {
      userStats[u.id] = {
        depot_effectue:    { n: 0, vol: 0 },  // agent fait dépôt pour client
        retrait_effectue:  { n: 0, vol: 0 },  // agent fait retrait pour client
        transfert_envoye:  { n: 0, vol: 0 },
        transfert_recu:    { n: 0, vol: 0 },
        paiement_recu:     { n: 0, vol: 0 },  // business reçoit paiement
        paiement_envoye:   { n: 0, vol: 0 },  // client fait paiement
        depot_recu:        { n: 0, vol: 0 },  // client reçoit dépôt
        retrait_fait:      { n: 0, vol: 0 },  // client fait retrait
        comm_gagnee:       { n: 0, vol: 0 },
      }
    })

    const compteSetSource = new Set(compteIds)
    txns.forEach(tx => {
      // Forcer string pour les UUIDs (Prisma peut retourner Buffer)
      tx.compteSourceId = tx.compteSourceId ? String(tx.compteSourceId) : null
      tx.compteDestId   = tx.compteDestId   ? String(tx.compteDestId)   : null
      tx.agentId        = tx.agentId        ? String(tx.agentId)        : null
      const m = Number(tx.montant || 0)
      const f = Number(tx.frais || 0)
      const isSource = compteSetSource.has(tx.compteSourceId)
      const isDest = compteSetSource.has(tx.compteDestId)
      const srcUserId = userByCompte[tx.compteSourceId]
      const destUserId = userByCompte[tx.compteDestId]

      if (targetRole === 'agent') {
        const agentUserId = userByCompte[tx.agentId] || (tx.agentId && users.find(u => u.compte_id === tx.agentId)?.id)
        if (tx.type === 'depot' && agentUserId && userStats[agentUserId]) {
          userStats[agentUserId].depot_effectue.n++
          userStats[agentUserId].depot_effectue.vol += m
        } else if (tx.type === 'retrait' && agentUserId && userStats[agentUserId]) {
          userStats[agentUserId].retrait_effectue.n++
          userStats[agentUserId].retrait_effectue.vol += m
        } else if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        }
      } else if (targetRole === 'business') {
        if (tx.type === 'paiement_marchand') {
          if (isDest && destUserId && userStats[destUserId]) {
            userStats[destUserId].paiement_recu.n++
            userStats[destUserId].paiement_recu.vol += m
          }
          if (isSource && srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].paiement_envoye.n++
            userStats[srcUserId].paiement_envoye.vol += m
          }
        } else if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        }
      } else if (targetRole === 'mini_master' || targetRole === 'master') {
        if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        } else if (tx.type === 'depot') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].depot_effectue.n++
            userStats[srcUserId].depot_effectue.vol += m
          }
        } else if (tx.type === 'retrait') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].retrait_effectue.n++
            userStats[srcUserId].retrait_effectue.vol += m
          }
        }
      } else if (targetRole === 'client') {
        if (tx.type === 'depot' && isDest && destUserId && userStats[destUserId]) {
          userStats[destUserId].depot_recu.n++
          userStats[destUserId].depot_recu.vol += m
        } else if (tx.type === 'retrait' && isSource && srcUserId && userStats[srcUserId]) {
          userStats[srcUserId].retrait_fait.n++
          userStats[srcUserId].retrait_fait.vol += m
        } else if (tx.type === 'transfert') {
          if (srcUserId && userStats[srcUserId]) {
            userStats[srcUserId].transfert_envoye.n++
            userStats[srcUserId].transfert_envoye.vol += m
          }
          if (destUserId && userStats[destUserId]) {
            userStats[destUserId].transfert_recu.n++
            userStats[destUserId].transfert_recu.vol += m
          }
        } else if (tx.type === 'paiement_marchand' && isSource && srcUserId && userStats[srcUserId]) {
          userStats[srcUserId].paiement_envoye.n++
          userStats[srcUserId].paiement_envoye.vol += m
        }
      }
    })

    // 4. Totaux globaux
    const totaux = {
      depot_effectue:   { n: 0, vol: 0 },
      retrait_effectue: { n: 0, vol: 0 },
      transfert_envoye: { n: 0, vol: 0 },
      transfert_recu:   { n: 0, vol: 0 },
      paiement_recu:    { n: 0, vol: 0 },
      paiement_envoye:  { n: 0, vol: 0 },
      depot_recu:       { n: 0, vol: 0 },
      retrait_fait:     { n: 0, vol: 0 },
    }
    Object.values(userStats).forEach(st => {
      Object.keys(totaux).forEach(k => {
        if (st[k]) { totaux[k].n += st[k].n; totaux[k].vol += st[k].vol }
      })
    })

    // 5. Courbe temporelle (pour le graphique)
    // Agrégation par jour/semaine/mois selon la période
    const courbeMap = {}
    txns.forEach(tx => {
      const d = new Date(tx.date_creation)
      let key
      if (period === 'day' || period === 'today') key = d.getHours() + 'h'
      else if (period === 'week') key = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })
      else if (period === 'year') key = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()]
      else key = d.getDate().toString() // month → jours

      if (!courbeMap[key]) courbeMap[key] = {}
      const cat = tx.type === 'depot' ? (targetRole === 'client' ? 'depot_recu' : 'depot_effectue')
        : tx.type === 'retrait' ? (targetRole === 'client' ? 'retrait_fait' : 'retrait_effectue')
        : tx.type === 'paiement_marchand' ? (compteSetSource.has(tx.compteDestId) ? 'paiement_recu' : 'paiement_envoye')
        : (compteSetSource.has(tx.compteSourceId) ? 'transfert_envoye' : 'transfert_recu')
      courbeMap[key][cat] = (courbeMap[key][cat] || 0) + Number(tx.montant || 0)
    })

    // Construire labels ordonnés
    const courbe = Object.entries(courbeMap).map(([label, vals]) => ({ label, ...vals }))

    // 6. Enrichir users avec leurs stats
    const usersEnriched = users.map(u => ({
      ...u,
      stats: userStats[u.id] || {}
    }))

    return ok(res, {
      users: usersEnriched,
      totaux,
      courbe,
      periode: period,
      role: targetRole,
      debut: debutStr,
      total_users: users.length,
      total_actifs: users.filter(u => u.statut === 'actif').length
    })
  } catch(e) { return err(res, e.message, 500) }
})

// ══════════════════════════════════════════════
// ANCIEN SYSTÈME alertes_fraude (conservé pour compatibilité)
app.patch('/api/v1/alerts-fraude/:id', authMiddleware, role('admin','superviseur','support_tech'), async (req, res) => {
  try {
    const afBody = req.body
    const afSets = Object.keys(afBody).map((k,i) => `${k}=$${i+1}`).join(',')
    const afVals = [...Object.values(afBody), req.params.id]
    const afRows = await sql(`UPDATE alertes_fraude SET ${afSets} WHERE id=$${afVals.length} RETURNING *`, ...afVals)
    return ok(res, afRows[0] || {})
  } catch(e){return err(res,e.message,500)}
})

// ═══ COMMISSIONS — liste des commissions d'un utilisateur ═══
app.get('/api/v1/commissions', authMiddleware, async (req, res) => {
  try {
    const { type, userId, limit=50 } = req.query
    const targetId = userId || toUUID(req.user.id)
    if (!['admin','superviseur','support_client','support_tech'].includes(req.user.role) && targetId !== toUUID(req.user.id)) {
      return err(res, 'Accès refusé', 403)
    }
    const toUUID_c = (v) => { if(!v) return null; if(Buffer.isBuffer(v)) return v.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'); return String(v); }
    const targetIdStr = toUUID_c(targetId === toUUID(req.user.id) ? toUUID(req.user.id) : targetId)
    let sqlQuery = `SELECT * FROM commissions WHERE beneficiaire_id = $1`
    const params = [targetId]
    if (type) { sqlQuery += ` AND type_commission = $${params.length+1}`; params.push(type) }
    sqlQuery += ` ORDER BY date_calcul DESC LIMIT $${params.length+1}`; params.push(Number(limit))
    const comms = await sql(sqlQuery, ...params)
    return ok(res, comms)
  } catch(e) { return err(res, e.message, 500) }
})


// ═══ VIREMENT GAINS → COMPTE PRINCIPAL ═══
// ═══ VIREMENT COMMISSIONS (dépôt/retrait) → COMPTE PRINCIPAL ═══
app.post('/api/v1/accounts/transfer-commissions', authMiddleware, async (req, res) => {
  try {
    const { montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 1) return err(res, 'Montant invalide')
    const uid = toUUID(req.user.id)
    // Solde commissions dépôt/retrait disponibles
    const rows = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id=$1 AND statut='verse' AND type_commission IN ('depot_agent','retrait_agent')`,
      uid
    )
    const disponible = Number(rows[0]?.total || 0)
    if (amt > disponible) return err(res, `Commissions insuffisantes (${disponible} FCFA disponibles)`)
    // Récupérer compte agent
    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, uid)
    const compteId = compteRows[0]?.id
    if (!compteId) return err(res, 'Compte introuvable')
    // Créditer le compte
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, [amt, compteId])
    // Marquer uniquement les commissions nécessaires pour couvrir amt (virement partiel)
    const commToVire = await sql(
      `SELECT id, montant::float as montant FROM commissions WHERE beneficiaire_id=$1 AND statut='verse' AND type_commission IN ('depot_agent','retrait_agent') ORDER BY date_calcul ASC`,
      uid
    )
    let reste = amt
    for (const c of commToVire) {
      if (reste <= 0) break
      const cm = Number(c.montant)
      if (cm <= reste) {
        // Marquer entièrement cette commission
        await pgPool.query(`UPDATE commissions SET statut='vire' WHERE id=$1`, [c.id])
        reste -= cm
      } else {
        // Fractionner : réduire le montant restant de cette commission
        await pgPool.query(`UPDATE commissions SET montant=montant-$1 WHERE id=$2`, [reste, c.id])
        reste = 0
      }
    }
    // Enregistrer le virement dans transactions
    const txId = require('crypto').randomUUID()
    const ref = 'VRC-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'virement_commission','complete',$3,$4,$5,0,$6,NOW())`,
      [txId, ref, compteId, compteId, amt, uid]
    ).catch(()=>{})
    return ok(res, { message: `Virement de ${amt} FCFA effectué`, montant: amt, reference: ref, nouveauSolde: disponible - amt })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ VIREMENT GAINS PARRAINAGE → COMPTE PRINCIPAL ═══
app.post('/api/v1/accounts/transfer-gains', authMiddleware, async (req, res) => {
  try {
    const { montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 1) return err(res, 'Montant invalide')
    const uid = toUUID(req.user.id)
    // Solde gains parrainage disponibles
    const rows = await sql(
      `SELECT COALESCE(SUM(montant),0)::float as total FROM commissions WHERE beneficiaire_id=$1 AND statut='verse' AND type_commission IN ('parrainage','commission_parrain')`,
      uid
    )
    const disponible = Number(rows[0]?.total || 0)
    if (amt > disponible) return err(res, `Gains insuffisants (${disponible} FCFA disponibles)`)
    // Récupérer compte agent
    const compteRows = await sql(`SELECT id::text as id FROM comptes WHERE utilisateur_id=$1 LIMIT 1`, uid)
    const compteId = compteRows[0]?.id
    if (!compteId) return err(res, 'Compte introuvable')
    // Créditer le compte
    await pgPool.query(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, [amt, compteId])
    // Marquer uniquement les gains nécessaires pour couvrir amt (virement partiel)
    const gainsToVire = await sql(
      `SELECT id, montant::float as montant FROM commissions WHERE beneficiaire_id=$1 AND statut='verse' AND type_commission IN ('parrainage','commission_parrain') ORDER BY date_calcul ASC`,
      uid
    )
    let resteG = amt
    for (const g of gainsToVire) {
      if (resteG <= 0) break
      const gm = Number(g.montant)
      if (gm <= resteG) {
        await pgPool.query(`UPDATE commissions SET statut='vire' WHERE id=$1`, [g.id])
        resteG -= gm
      } else {
        await pgPool.query(`UPDATE commissions SET montant=montant-$1 WHERE id=$2`, [resteG, g.id])
        resteG = 0
      }
    }
    // Enregistrer le virement dans transactions
    const txId2 = require('crypto').randomUUID()
    const ref2 = 'VRG-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO transactions (id,reference,type,statut,compte_source_id,compte_dest_id,montant,frais,initiateur_id,date_creation)
       VALUES ($1,$2,'virement_gains','complete',$3,$4,$5,0,$6,NOW())`,
      [txId2, ref2, compteId, compteId, amt, uid]
    ).catch(()=>{})
    return ok(res, { message: `Virement de ${amt} FCFA effectué`, montant: amt, reference: ref2, nouveauSolde: disponible - amt })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ TICKETS — admin, superviseur, support_client, support_tech ═══
app.get('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {statut, limit=50, service} = req.query
    const canSeeAll = BACKOFFICE.includes(req.user.role)
    let where = canSeeAll ? {} : {clientId:toUUID(req.user.id)}
    // Utiliser queryRaw pour éviter le cast enum StatutTicket
    const tkConditions = []
    const tkParams = []
    let tkIdx = 1
    if (!canSeeAll) { tkConditions.push(`t.client_id = $${tkIdx}`); tkParams.push(where.clientId); tkIdx++ }
    if (statut) { tkConditions.push(`t.statut = $${tkIdx}`); tkParams.push(statut); tkIdx++ }
    if (service) { tkConditions.push(`t.service = $${tkIdx}`); tkParams.push(service); tkIdx++ }
    const tkWhere = tkConditions.length > 0 ? 'WHERE ' + tkConditions.join(' AND ') : ''
    const tkLimit = parseInt(limit) || 50
    const list = await sql(
      `SELECT t.id, t.reference, t.sujet, t.description, t.statut, t.priorite, t.service, t.date_creation as date_creation, t.date_resolution as "dateResolution", u.prenom, u.nom, u.telephone FROM tickets_support t LEFT JOIN utilisateurs u ON u.id = t.client_id ${tkWhere} ORDER BY t.date_creation DESC LIMIT ${tkLimit}`,
      ...tkParams
    )
    return ok(res, list)
  } catch(e){return err(res,e.message,500)}
})

// Supprimer un ticket
app.delete('/api/v1/tickets/:id', authMiddleware, role('admin'), async (req, res) => {
  try {
    await pgPool.query("DELETE FROM tickets_support WHERE id = $1", [req.params.id])
    return ok(res, {message:'Ticket supprimé'})
  } catch(e){return err(res,e.message,500)}
})

app.post('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {sujet, description, service, telephone, priorite} = req.body
    // Si support crée un ticket pour un client
    let clientId = toUUID(req.user.id)
    if (BACKOFFICE.includes(req.user.role) && telephone) {
      const tktClientRows = await sql(`SELECT id::text as id FROM utilisateurs WHERE telephone=$1 LIMIT 1`, telephone)
      if (tktClientRows[0]) clientId = tktClientRows[0].id
    }
    // Service: utiliser la valeur fournie, sinon déduire selon le rôle
    const validServices = ['support_client', 'support_tech', 'backoffice', 'admin', 'superviseur']
    const svc = (service && validServices.includes(service)) ? service : (
      req.user.role === 'support_tech' ? 'support_tech' :
      req.user.role === 'support_client' ? 'support_client' :
      req.user.role === 'admin' || req.user.role === 'superviseur' ? 'admin' : 'backoffice'
    )
    const ref_t = 'TKT-' + Date.now().toString(36).toUpperCase()
    const ticketData = {
      sujet, description,
      statut: 'ouvert',
      clientId,
      service: svc,
      reference: ref_t
    }
    if (priorite) ticketData.priorite = priorite
    // Utiliser SQL brut pour éviter les contraintes d'enum Prisma sur priorite
    const prio = priorite || 'normal'
    const t = await sql(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, client_id, service, priorite, date_creation)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'ouvert', $4, $5, $6, NOW())
       RETURNING id::text, reference, sujet, description, statut, service, priorite, date_creation::text as date_creation`,
      ref_t, sujet, description, clientId, svc, prio
    )
    await logAction(req.user, 'ticket_cree', {id:String(clientId||''),prenom:'',nom:'',role:svc,telephone:''},
      '['+prio.toUpperCase()+'] '+sujet+' — '+description.slice(0,60))
    return ok(res, t[0], 201)
  } catch(e){return err(res,e.message,500)}
})

// Mettre à jour statut ticket — admin, superviseur, support_client, support_tech
app.patch('/api/v1/tickets/:id/status', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { statut } = req.body
    const validStatuts = ['ouvert','en_cours','escalade','resolu','ferme','rejete']
    if (!validStatuts.includes(statut)) return err(res, 'Statut invalide')
    // SQL brut pour éviter que Prisma recharge le champ priorite (enum incompatible)
    const rows = await sql(
      `UPDATE tickets_support SET statut = $1
       WHERE id = $2
       RETURNING id::text, reference, sujet, statut, service, priorite, client_id::text as "clientId", date_creation::text as date_creation`,
      statut, req.params.id
    )
    if (!rows.length) return err(res, 'Ticket introuvable', 404)
    const t = rows[0]
    if (t.clientId && ['resolu','ferme','rejete'].includes(statut)) {
      const msgs = {
        resolu: ['✅ Ticket résolu',   'Votre demande de support a été résolue.'],
        ferme:  ['🔒 Ticket clôturé', 'Votre ticket a été clôturé.'],
        rejete: ['❌ Ticket rejeté',   "Votre demande n'a pu être traitée."]
      }
      const [titre, msg] = msgs[statut]
      await notifier(t.clientId, 'systeme', titre, msg, {ticketId: t.id})
    }
    return ok(res, t)
  } catch(e){ return err(res, e.message, 500) }
})

// Ajouter commentaire/note à un ticket
app.post('/api/v1/tickets/:id/note', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { note } = req.body
    if (!note) return err(res, 'note requise')
    await pgPool.query(
      `UPDATE tickets_support SET description = $1 WHERE id = $2`,
      [note, req.params.id]
    )
    return ok(res, { id: req.params.id, description: note })
  } catch(e){ return err(res,e.message,500) }
})

// ═══ RÉSEAU ═══
app.get('/api/v1/network/agents', authMiddleware, async (req, res) => {
  try {
    const agents = await sql(
      `SELECT u.id::text as id, u.prenom, u.nom, u.telephone, u.zone, u.statut, u.code_parrainage as "codeParrainage",
              json_agg(json_build_object('id',c.id::text,'solde',c.solde::float)) FILTER (WHERE c.id IS NOT NULL) as comptes
       FROM utilisateurs u LEFT JOIN comptes c ON c.utilisateur_id=u.id
       WHERE u.parrain_id=$1 AND u.role='agent' GROUP BY u.id`, toUUID(req.user.id)
    )
    return ok(res,agents)
  } catch(e){return err(res,e.message,500)}
})

// ═══ KYC DOCUMENTS — support_client peut voir les photos ═══

// Enregistrer URL document KYC après upload Cloudinary
app.post('/api/v1/kyc/documents', authMiddleware, async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier, hashFichier } = req.body
    if (!userId || !typeDocument || !urlFichier) return err(res, 'userId, typeDocument et urlFichier requis')
    // S'assurer que la table et ses colonnes existent (migration défensive)
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type_document TEXT NOT NULL,
        url_fichier TEXT NOT NULL,
        hash_fichier TEXT DEFAULT 'none',
        statut TEXT NOT NULL DEFAULT 'soumis',
        commentaire TEXT,
        verifie_par TEXT,
        date_soumission TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        date_verification TIMESTAMP
      )
    `).catch(()=>{})
    // Ajouter les colonnes manquantes si la table existait déjà sans elles
    const migCols = [
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS hash_fichier TEXT DEFAULT 'none'`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'soumis'`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_soumission TIMESTAMP DEFAULT NOW()`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS commentaire TEXT`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verifie_par TEXT`,
      `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_verification TIMESTAMP`,
    ]
    for (const sqlCol of migCols) {
      await pgPool.query(sqlCol).catch(()=>{})
    }
    const id = require('crypto').randomUUID()
    // Supprimer l'ancien doc du même type pour ce user (remplacement)
    await pgPool.query(
      `DELETE FROM kyc_documents WHERE utilisateur_id = $1 AND type_document = $2`,
      [userId, typeDocument]
    ).catch(()=>{})
    // Détecter les colonnes disponibles pour un INSERT adapté
    let insertOk = false
    // Tentative 1 : INSERT complet avec toutes les colonnes
    try {
      await pgPool.query(
        `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, hash_fichier, statut, date_soumission, created_at)
         VALUES ($1, $2, $3, $4, $5, 'soumis', NOW(), NOW())`,
        [id, userId, typeDocument, urlFichier, hashFichier||'none']
      )
      insertOk = true
    } catch(e1) {
      // Tentative 2 : sans date_soumission/created_at
      try {
        await pgPool.query(
          `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, hash_fichier, statut)
           VALUES ($1, $2, $3, $4, $5, 'soumis')`,
          [id, userId, typeDocument, urlFichier, hashFichier||'none']
        )
        insertOk = true
      } catch(e2) {
        // Tentative 3 : sans hash_fichier
        try {
          await pgPool.query(
            `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, statut)
             VALUES ($1, $2, $3, $4, 'soumis')`,
            [id, userId, typeDocument, urlFichier]
          )
          insertOk = true
        } catch(e3) {
          // Tentative 4 : minimal absolu
          await pgPool.query(
            `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier)
             VALUES ($1, $2, $3, $4)`,
            [id, userId, typeDocument, urlFichier]
          )
          insertOk = true
        }
      }
    }
    return ok(res, { id, utilisateurId: userId, typeDocument, urlFichier, statut: 'soumis' }, 201)
  } catch(e) { return err(res, e.message, 500) }
})

app.get('/api/v1/kyc/documents', authMiddleware, async (req, res) => {
  try {
    const { userId, type } = req.query
    // Un client ne peut voir que ses propres documents
    const targetId = BACKOFFICE.includes(req.user.role) ? (userId || toUUID(req.user.id)) : toUUID(req.user.id)
    let query = `SELECT id, type_document as "typeDocument", url_fichier as "urlFichier", statut, COALESCE(date_soumission, created_at) as "dateSoumission" FROM kyc_documents WHERE utilisateur_id = $1`
    const params = [targetId]
    if (type) { query += ` AND type_document = $2`; params.push(type) }
    query += ` ORDER BY COALESCE(date_soumission, created_at) DESC`
    const docs = await sql(query, ...params)
    return ok(res, docs)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ KYC REQUEST — client soumet une demande de montée de niveau ═══
app.post('/api/v1/kyc/request', authMiddleware, async (req, res) => {
  try {
    const { userId, niveauDemande } = req.body
    const targetId = userId || toUUID(req.user.id)
    // SQL brut — évite le cast enum Prisma sur kyc_niveau
    const userRows = await sql(
      `SELECT id::text as id, kyc_niveau as "kycNiveau", statut FROM utilisateurs WHERE id = $1 LIMIT 1`,
      targetId
    )
    if (!userRows.length) return err(res, 'Utilisateur introuvable', 404)
    const user = userRows[0]
    // Passer statut → en_attente et mémoriser le niveau demandé (tout en SQL brut)
    await pgPool.query(
      `UPDATE utilisateurs SET statut = 'en_attente', kyc_niveau_demande = $1, updated_at = NOW() WHERE id = $2`,
      [niveauDemande, targetId]
    )
    // Créer un ticket automatique pour le back-office
    const ref = 'KYC-' + Date.now().toString(36).toUpperCase()
    const ticketId = require('crypto').randomUUID()
    await pgPool.query(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, service, priorite, client_id, date_creation)
       VALUES ($1, $2, $3, $4, 'ouvert', 'support_client', 'normal', $5, NOW())`,
      [ticketId, ref,
      'Demande upgrade KYC → ' + niveauDemande,
      'Le client a soumis ses documents pour passer au niveau ' + niveauDemande + '. Niveau actuel : ' + (user.kycNiveau||'aucun') + '. Photos disponibles dans la fiche client. Veuillez vérifier et valider sous 48h.',
      targetId]
    ).catch(e => console.warn('ticket kyc:', e.message))
    await notifier(targetId, 'kyc', '⏳ Dossier KYC soumis',
      `Votre dossier ${niveauDemande} a été soumis. Validation sous 48h.`,
      { niveauDemande }
    )
    return ok(res, { message: 'Demande soumise — en attente de validation (48h)', reference: ref, statut: 'en_attente' })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ KYC — admin et superviseur valident ═══
app.get('/api/v1/kyc/:userId/validate', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try {
    // SQL brut — évite cast enum Prisma sur kyc_niveau
    await pgPool.query(
      `UPDATE utilisateurs SET kyc_niveau=$1, statut='actif', kyc_niveau_demande=NULL, updated_at=NOW() WHERE id = $2`,
      [req.body.kycNiveau||'KYC1', req.params.userId]
    )
    await notifier(req.params.userId, 'kyc', '✅ KYC validé',
      `Félicitations ! Votre dossier a été validé. Votre nouveau plafond est actif.`,
      {}
    )
    return ok(res, { id: req.params.userId, kycNiveau: req.body.kycNiveau, statut: 'actif' })
  } catch(e){return err(res,e.message,500)}
})

// PATCH /kyc/:id/reject — rejeter une demande KYC
app.patch('/api/v1/kyc/:userId/reject', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { raison } = req.body
    // Effacer la demande en attente
    await pgPool.query(
      `UPDATE utilisateurs SET kyc_niveau_demande = NULL WHERE id = $1`,
      [req.params.userId]
    )
    // Créer un ticket d'information pour le client
    const ref = 'KYC-REJ-'+Date.now().toString(36).toUpperCase()
    await pgPool.query(
      `INSERT INTO tickets_support (id, reference, sujet, description, statut, service, priorite, client_id, date_creation)
       VALUES (gen_random_uuid(), $1, 'Documents KYC rejetés', $2, 'ferme', 'support_client', 'normal', $3, NOW())`,
      [ref, 'Vos documents ont été rejetés. Raison : ' + (raison || 'Documents non conformes') + '. Veuillez soumettre à nouveau des documents lisibles et valides.', req.params.userId]
    ).catch(() => {})
    // Notification rejet KYC avec motif
    await notifier(req.params.userId, 'kyc', '❌ Documents KYC refusés',
      (raison || 'Documents non conformes. Veuillez soumettre de nouveaux documents lisibles et valides.') + '',
      { raison: raison || null, action: 'resoumettre' }
    )
    return ok(res, { message: 'Demande rejetée', raison })
  } catch(e) { return err(res, e.message, 500) }
})

// Route diagnostic — trouver les vrais noms des enums PostgreSQL
app.get('/api/v1/debug/enums', async (req, res) => {
  try {
    const enums = await sql(`SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname`)
    return ok(res, enums)
  } catch(e) { return err(res, e.message) }
})

// PATCH /users/:id/kyc — valider le niveau KYC (support_client + admin)
app.patch('/api/v1/users/:id/kyc', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { kycNiveau } = req.body
    if (!kycNiveau) return err(res, 'kycNiveau requis')
    const kycValide = ['KYC1','KYC2','KYC3'].includes(kycNiveau) ? kycNiveau : 'KYC1'
    // Vérifier si kyc_niveau est un enum ou un text
    const colInfo = await sql(
      `SELECT data_type FROM information_schema.columns WHERE table_name='utilisateurs' AND column_name='kyc_niveau' LIMIT 1`
    )
    // Toujours SQL brut — kyc_niveau est TEXT en base (pas enum)
    await pgPool.query(
      `UPDATE utilisateurs SET kyc_niveau=$1, statut='actif', updated_at=NOW() WHERE id = $2`,
      [kycValide, req.params.id]
    )
    // Étape 3 : colonnes optionnelles (silencieux si inexistantes)
    await pgPool.query(`UPDATE utilisateurs SET kyc_niveau_demande = NULL WHERE id = $1`, [req.params.id]).catch(()=>{})
    await pgPool.query(`UPDATE utilisateurs SET kyc_valide_le = NOW() WHERE id = $1`, [req.params.id]).catch(()=>{})
    // Étape 4 : plafond compte
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const plafond = plafonds[kycValide]
    if (plafond) {
      await pgPool.query(`UPDATE comptes SET plafond_mensuel = $1 WHERE utilisateur_id = $2`, [plafond, req.params.id]).catch(()=>{})
    }
    // Notification
    await notifier(req.params.id, 'kyc', '✅ KYC validé', `Félicitations ! Votre compte est maintenant actif au niveau ${kycValide}.`, {}).catch(()=>{})
    return ok(res, { id: req.params.id, kycNiveau: kycValide, statut: 'actif' })
  } catch(e) {
    console.error('❌ PATCH /users/:id/kyc ERROR:', e.message)
    return err(res, e.message, 500)
  }
})

// ═══ DÉMARRAGE ═══
async function main() {
  try {
    // Connexion pgPool d'abord (plus fiable que Prisma sur Render cold start)
    await pgPool.query('SELECT 1')
    console.log('✅ pgPool connecté')
    try {
      await prisma.$connect()
      console.log('✅ Prisma connecté')
    } catch(pe) {
      console.warn('⚠️ Prisma connect warning (non-fatal):', pe.message)
    }

    // ── TABLE NOTIFICATIONS — créée en priorité ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type TEXT NOT NULL,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        lu BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('notifications init:', e.message))
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(()=>{})
    console.log('✅ Table notifications prête')

    // ── TABLE CAMPAGNES NOTIFICATIONS — historique centralisé ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notif_campagnes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'systeme',
        cible TEXT NOT NULL,
        nb_destinataires INTEGER DEFAULT 0,
        envoye_par TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('notif_campagnes init:', e.message))
    console.log('✅ Table notif_campagnes prête')

    // Créer les tables manquantes si elles n'existent pas
    // Ajouter colonne initiateur_role si manquante
    await pgPool.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS initiateur_role TEXT NOT NULL DEFAULT 'client'
    `).catch(e => console.log('initiateur_role:', e.message))

    // Ajouter colonne kyc_niveau_demande pour suivre les demandes en attente
    await pgPool.query(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_niveau_demande TEXT DEFAULT NULL
    `).catch(e => console.log('kyc_niveau_demande:', e.message))

    // Ajouter colonne kyc_valide_le pour suivre la date de validation KYC
    await pgPool.query(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_valide_le TIMESTAMP DEFAULT NULL
    `).catch(e => console.log('kyc_valide_le:', e.message))

    // Table rattachements : filleuls ayant rempli les 2 conditions
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS rattachements (
        id TEXT PRIMARY KEY,
        parrain_id TEXT NOT NULL,
        filleul_id TEXT NOT NULL UNIQUE,
        date_entree TIMESTAMP,
        date_sortie TIMESTAMP,
        statut TEXT DEFAULT 'en_cours',
        created_at TIMESTAMP DEFAULT NOW(),
        verifie_remboursement BOOLEAN DEFAULT FALSE,
        CONSTRAINT fk_parrain FOREIGN KEY (parrain_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
        CONSTRAINT fk_filleul FOREIGN KEY (filleul_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
      )
    `).catch(e => console.log('rattachements:', e.message))
    // Ajout colonne pour les tables déjà existantes (créées avant cette mise à jour)
    await pgPool.query(`ALTER TABLE rattachements ADD COLUMN IF NOT EXISTS verifie_remboursement BOOLEAN DEFAULT FALSE`).catch(()=>{})

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        type_document TEXT NOT NULL,
        url_fichier TEXT NOT NULL,
        hash_fichier TEXT NOT NULL DEFAULT 'none',
        statut TEXT NOT NULL DEFAULT 'soumis',
        commentaire TEXT,
        verifie_par TEXT,
        date_soumission TIMESTAMP DEFAULT NOW(),
        date_verification TIMESTAMP
      )
    `)
    console.log('✅ Table kyc_documents OK')

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS tickets_support (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        reference TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL REFERENCES utilisateurs(id),
        transaction_id TEXT,
        sujet TEXT NOT NULL,
        description TEXT NOT NULL,
        priorite TEXT NOT NULL DEFAULT 'moyenne',
        statut TEXT NOT NULL DEFAULT 'ouvert',
        assigne_a TEXT,
        escalade_a TEXT,
        sla_expiration TIMESTAMP,
        date_creation TIMESTAMP DEFAULT NOW(),
        date_resolution TIMESTAMP
      )
    `)
    console.log('✅ Table tickets_support OK')

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes_fraude (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        type_alerte TEXT NOT NULL,
        niveau TEXT NOT NULL DEFAULT 'info',
        utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
        transaction_id TEXT,
        description TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT 'active',
        detecte_par TEXT NOT NULL DEFAULT 'systeme',
        traite_par TEXT,
        action_prise TEXT,
        date_detection TIMESTAMP DEFAULT NOW(),
        date_traitement TIMESTAMP
      )
    `)
    console.log('✅ Table alertes_fraude OK')

    // ── TABLE ALERTES CENTRALISÉES ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS alertes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        gravite TEXT NOT NULL DEFAULT 'moyenne',
        service TEXT NOT NULL DEFAULT 'admin',
        statut TEXT NOT NULL DEFAULT 'ouverte',
        auteur TEXT NOT NULL DEFAULT 'systeme',
        auteur_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        traite_par TEXT,
        resolution TEXT
      )
    `).catch(e => console.log('alertes init:', e.message))
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_alertes_service ON alertes(service, statut, created_at DESC)
    `).catch(()=>{})
    console.log('✅ Table alertes centralisées prête')

    // Table notifications
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type TEXT NOT NULL,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        lu BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('notifications:', e.message))
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(() => {})
    console.log('✅ Table notifications OK')

  } catch (e) {
    console.error('❌ Erreur DB (non-fatal):', e.message)
    // Ne pas crasher — le serveur reste UP, les routes SQL directes fonctionnent
  }
} // ← FIN de main()


// Route pour créer/vérifier la table notifications (utile si main() n a pas eu le temps)
app.post('/api/v1/admin/setup-notifications', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        utilisateur_id TEXT NOT NULL,
        type TEXT NOT NULL,
        titre TEXT NOT NULL,
        message TEXT NOT NULL,
        lu BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(()=>{})
    return ok(res, { message: 'Table notifications prête' })
  } catch(e) { return err(res, e.message, 500) }
})

// ── ROUTES NOTIFICATIONS ──────────────────────────────────────────────

// Lister les notifications de l'utilisateur connecté
// Route debug auth — voir ce que retourne toUUID(req.user.id) exactement
// Route compteur notifications non lues
app.get('/api/v1/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const rows = await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1 AND lu=false",
      toUUID(req.user.id)
    )
    return ok(res, { count: rows[0]?.n || 0 })
  } catch(e) { return ok(res, { count: 0 }) }
})

app.get('/api/v1/notifications/debug-id', authMiddleware, async (req, res) => {
  try {
    const rawId = toUUID(req.user.id)
    const idType = typeof rawId
    const isBuffer = Buffer.isBuffer(rawId)
    const idStr = isBuffer ? rawId.toString('hex') : String(rawId)
    const idStrDirect = String(rawId)
    // Chercher par téléphone
    const byTel = await sql(
      "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone
    )
    // Compter les notifs avec chaque format
    const countHex = await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", idStr
    ).catch(() => [{n:-1}])
    const countDirect = await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", idStrDirect
    ).catch(() => [{n:-1}])
    const countByTel = byTel[0] ? await sql(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", byTel[0].id
    ).catch(() => [{n:-1}]) : [{n:-1}]
    return res.json({
      telephone: req.user.telephone,
      rawId_type: idType,
      isBuffer,
      idStr_hex: idStr,
      idStr_direct: idStrDirect,
      id_by_tel: byTel[0]?.id || null,
      notifs_with_hex: countHex[0].n,
      notifs_with_direct: countDirect[0].n,
      notifs_with_byTel: countByTel[0].n
    })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/api/v1/notifications', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30
    // Utiliser le telephone (depuis query ou depuis req.user) pour obtenir l'ID fiable
    const tel = req.query.tel || req.user.telephone
    let uidSql = null
    if (tel) {
      try {
        const userRow = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", tel
        )
        if (userRow && userRow[0]) uidSql = userRow[0].id
      } catch(e) {}
    }
    // Fallback: utiliser toUUID(req.user.id) directement
    if (!uidSql) {
      const rawId = toUUID(req.user.id)
      uidSql = Buffer.isBuffer(rawId) ? rawId.toString('hex') : String(rawId)
    }

    let notifs = []
    let nonLues = [{count:0}]
    try {
      notifs = await sql(
        "SELECT id::text, type, titre, message, lu, data, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT $2",
        uidSql, limit
      )
    } catch(e) { console.error('GET notifs err:', e.message) }
    try {
      nonLues = await sql(
        "SELECT COUNT(*)::int as count FROM notifications WHERE utilisateur_id = $1 AND lu = FALSE",
        uidSql
      )
    } catch(e) { console.error('GET nonLues err:', e.message) }
    return ok(res, { notifications: notifs, nonLues: Number(nonLues[0]?.count || 0) })
  } catch(e) { return err(res, e.message, 500) }
})

// Marquer une notification comme lue
app.patch('/api/v1/notifications/:id/lu', authMiddleware, async (req, res) => {
  try {
    let uid = String(toUUID(req.user.id))
    try { const r = await sql("SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone); if(r&&r[0]) uid = r[0].id } catch(e){}
    await pgPool.query(
      `UPDATE notifications SET lu = TRUE WHERE id = $1 AND utilisateur_id = $2`,
      [req.params.id, uid]
    )
    return ok(res, { message: 'Marquée comme lue' })
  } catch(e) { return err(res, e.message, 500) }
})

// Marquer toutes comme lues
app.patch('/api/v1/notifications/tout-lire', authMiddleware, async (req, res) => {
  try {
    let uid = String(toUUID(req.user.id))
    try { const r = await sql("SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone); if(r&&r[0]) uid = r[0].id } catch(e){}
    await pgPool.query(
      `UPDATE notifications SET lu = TRUE WHERE utilisateur_id = $1`,
      [uid]
    )
    return ok(res, { message: 'Toutes marquées comme lues' })
  } catch(e) { return err(res, e.message, 500) }
})

// Envoyer une notification admin → utilisateur(s)
app.post('/api/v1/notifications/envoyer', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, role: targetRole, titre, message, type = 'systeme' } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    if (userId) {
      await notifier(userId, type, titre, message)
      await logAction(req.user, 'notif_envoyee', {id:'', prenom:'', nom:'', role:targetRole||'?', telephone:userId||'?'}, titre+' — '+message.slice(0,60))
      return ok(res, { message: 'Notification envoyée', total: 1 })
    } else if (targetRole) {
      let users = []
      try {
        users = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE role = $1 AND statut NOT IN ('suspendu','bloque')",
          targetRole
        )
      } catch(e) { users = [] }
      for (const u of users) {
        await notifier(u.id, type, titre, message)
      }
      return ok(res, { message: users.length + ' notification(s) envoyée(s)', total: users.length })
    } else {
      return err(res, 'userId ou role requis')
    }
  } catch(e) { return err(res, e.message, 500) }
})

// Envoi masse multi-rôles
app.post('/api/v1/notifications/masse', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { titre, message, type = 'systeme', roles } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    const targetRoles = (roles && roles.length) ? roles : ['client','agent','business','mini_master','master','superviseur','support_client','support_tech','superviseur','admin']
    let total = 0
    const debug = []
    // Snapshot base
    try {
      const snap = await sql(
        'SELECT role, statut, COUNT(*)::int as n FROM utilisateurs GROUP BY role, statut'
      )
      debug.push('snap:' + JSON.stringify(snap))
      console.log('MASSE SNAP', JSON.stringify(snap))
    } catch(e) { debug.push('snap_err:' + e.message); console.log('MASSE SNAP ERR', e.message) }
    // Requête directe par rôle
    for (const r of targetRoles) {
      let users = []
      try {
        users = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE role = $1 AND statut NOT IN ('suspendu','bloque')",
          r
        )
      } catch(e) { debug.push('err_' + r + ':' + e.message); console.log('MASSE ERR', r, e.message) }
      debug.push(r + ':' + users.length)
      console.log('MASSE ROLE', r, users.length)
      for (const u of users) {
        await notifier(u.id, type, titre, message, {})
        total++
      }
    }
    console.log('MASSE TOTAL', total)
    // Enregistrer la campagne dans l'historique centralisé
    const cibleLabel = (roles && roles.length) ? roles.join(', ') : 'tous'
    await pgPool.query(
      "INSERT INTO notif_campagnes (titre, message, type, cible, nb_destinataires, envoye_par) VALUES ($1,$2,$3,$4,$5,$6)",
      [titre, message, type, cibleLabel, total, req.user.role]
    ).catch(e => console.log('campagne save err:', e.message))
    await logAction(req.user, 'notif_masse', {id:'',prenom:'',nom:'',role:cibleLabel,telephone:''},
      titre+' — '+message.slice(0,60)+' ('+total+' destinataires)')
    return ok(res, { message: total + ' notification(s) envoyée(s)', total, debug })
  } catch(e) { 
    console.error('masse notif erreur:', e.message)
    return err(res, e.message, 500) 
  }
})

// Historique notifications d'un utilisateur (backoffice)
app.get('/api/v1/notifications/user/:userId', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    const notifs = await sql(
      "SELECT id::text, utilisateur_id, type, titre, message, lu, data, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT $2",
      req.params.userId, limit
    )
    return ok(res, { notifications: notifs, total: notifs.length })
  } catch(e) { return err(res, e.message, 500) }
})

// Toutes les notifications du système (backoffice admin)
app.get('/api/v1/notifications/all', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    const offset = parseInt(req.query.offset) || 0
    const type = req.query.type || null
    const lu = req.query.lu !== undefined ? req.query.lu === 'true' : null
    const roleFilter = req.query.role || null  // filtre par rôle destinataire
    let q = "SELECT n.id::text, n.utilisateur_id, n.type, n.titre, n.message, n.lu, n.created_at::text, u.telephone, u.prenom, u.nom, u.role FROM notifications n LEFT JOIN utilisateurs u ON u.id::text = n.utilisateur_id WHERE 1=1"
    const params = []
    if (type) { params.push(type); q += " AND n.type = $" + params.length }
    if (lu !== null) { params.push(lu); q += " AND n.lu = $" + params.length }
    if (roleFilter === 'support') {
      q += " AND u.role IN ('support_client','support_tech')"
    } else if (roleFilter) {
      params.push(roleFilter); q += " AND u.role = $" + params.length
    }
    const countQ = q.replace(
      "SELECT n.id::text, n.utilisateur_id, n.type, n.titre, n.message, n.lu, n.created_at::text, u.telephone, u.prenom, u.nom, u.role",
      "SELECT COUNT(*)::int as n"
    )
    params.push(limit); q += " ORDER BY n.created_at DESC LIMIT $" + params.length
    params.push(offset); q += " OFFSET $" + params.length
    const notifs = await sql(q, ...params)
    const countParams = params.slice(0, params.length - 2)
    const countRow = await sql(countQ, ...countParams).catch(async () => {
      return sql("SELECT COUNT(*)::int as n FROM notifications")
    })
    return ok(res, { notifications: notifs, total: countRow[0].n })
  } catch(e) { return err(res, e.message, 500) }
})

// Supprimer une notification (admin)
// Supprimer plusieurs notifications par IDs (admin) — sélection multiple
// DOIT être AVANT /:id pour ne pas être capturé par le wildcard
app.delete('/api/v1/notifications/bulk', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const { ids, titre, message, partout } = req.body
    // Mode "supprimer pour tous" : supprime toutes les notifs avec ce titre+message
    if (partout && titre && message) {
      const result = await pgPool.query(
        "DELETE FROM notifications WHERE titre = $1 AND message = $2",
        [titre, message]
      )
      return ok(res, { message: 'Notification supprimée pour tous les utilisateurs', count: result })
    }
    // Mode sélection : supprime une liste d'IDs
    if (!ids || !ids.length) return err(res, 'ids requis', 400)
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const result = await pgPool.query(
      `DELETE FROM notifications WHERE id::text IN (${placeholders})`,
      ...ids
    )
    return ok(res, { message: `${ids.length} notification(s) supprimée(s)`, count: result })
  } catch(e) { return err(res, e.message, 500) }
})

// Supprimer une notification individuelle (admin) — APRÈS /bulk pour éviter conflit wildcard
app.delete('/api/v1/notifications/user/:userId', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const result = await pgPool.query("DELETE FROM notifications WHERE utilisateur_id = $1", [req.params.userId])
    return ok(res, { message: 'Notifications supprimées', count: result })
  } catch(e) { return err(res, e.message, 500) }
})

app.delete('/api/v1/notifications/:id', authMiddleware, role('admin', 'backoffice', 'support_client'), async (req, res) => {
  try {
    await pgPool.query("DELETE FROM notifications WHERE id::text = $1", [req.params.id])
    return ok(res, { message: 'Notification supprimée' })
  } catch(e) { return err(res, e.message, 500) }
})

// Envoyer notif directe depuis backoffice vers un utilisateur (par userId ou telephone)
app.post('/api/v1/notifications/direct', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, telephone, titre, message, type = 'systeme' } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    if (!userId && !telephone) return err(res, 'userId ou telephone requis')
    let uid = userId
    if (!uid && telephone) {
      const row = await sql(
        "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", telephone
      ).catch(() => [])
      if (!row || !row[0]) return err(res, 'Utilisateur introuvable', 404)
      uid = row[0].id
    }
    await notifier(uid, type, titre, message, { par: req.user.role })
    return ok(res, { message: 'Notification envoyée' })
  } catch(e) { return err(res, e.message, 500) }
})

// Notifier plusieurs utilisateurs par leurs téléphones (sélection manuelle)
app.post('/api/v1/notifications/multi', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { telephones, userIds, titre, message, type = 'systeme' } = req.body
    if (!titre || !message) return err(res, 'titre et message requis')
    const ids = []
    if (userIds && userIds.length) {
      ids.push(...userIds)
    }
    if (telephones && telephones.length) {
      for (const tel of telephones) {
        const row = await sql(
          "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", tel
        ).catch(() => [])
        if (row && row[0]) ids.push(row[0].id)
      }
    }
    if (!ids.length) return err(res, 'Aucun destinataire trouvé', 404)
    let sent = 0
    for (const uid of ids) {
      await notifier(uid, type, titre, message, { par: req.user.role })
      sent++
    }
    // Enregistrer la campagne
    const cibleMulti = telephones ? 'individuel ('+sent+' tel.)' : 'sélection ('+sent+')'
    await pgPool.query(
      "INSERT INTO notif_campagnes (titre, message, type, cible, nb_destinataires, envoye_par) VALUES ($1,$2,$3,$4,$5,$6)",
      [titre, message, type, cibleMulti, sent, req.user.role]
    ).catch(e => console.log('campagne save err:', e.message))
    return ok(res, { message: sent + ' notification(s) envoyée(s)', total: sent })
  } catch(e) { return err(res, e.message, 500) }
})

// ── CAMPAGNES NOTIFICATIONS — historique centralisé ──

// GET : liste des campagnes envoyées
app.get('/api/v1/notif-campagnes', authMiddleware, role('admin', 'backoffice', 'superviseur', 'support_client', 'support_tech'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    const campagnes = await sql(
      "SELECT id, titre, message, type, cible, nb_destinataires, envoye_par, created_at::text FROM notif_campagnes ORDER BY created_at DESC LIMIT $1",
      limit
    )
    return ok(res, { campagnes })
  } catch(e) { return err(res, e.message, 500) }
})

// DELETE : supprimer une campagne ET toutes ses notifications chez tous les destinataires
app.delete('/api/v1/notif-campagnes/:id', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const camp = await sql(
      "SELECT titre, message FROM notif_campagnes WHERE id = $1",
      req.params.id
    )
    if (!camp || !camp[0]) return err(res, 'Campagne introuvable', 404)
    const { titre, message } = camp[0]
    // Supprimer toutes les notifs avec ce titre+message
    const deleted = await pgPool.query(
      "DELETE FROM notifications WHERE titre = $1 AND message = $2",
      [titre, message]
    )
    // Supprimer la campagne de l'historique
    await pgPool.query("DELETE FROM notif_campagnes WHERE id = $1", [req.params.id])
    return ok(res, { message: 'Campagne supprimée', notifs_supprimees: deleted })
  } catch(e) { return err(res, e.message, 500) }
})

// ── Job de renouvellement KYC automatique ──
// Toutes les heures : repasser en en_attente les comptes actifs
// dont la validation KYC a plus de 48 heures
setInterval(async () => {
  try {
    const result = await pgPool.query(`
      UPDATE utilisateurs
      SET statut = 'en_attente'
      WHERE statut = 'actif'
        AND role = 'client'
        AND kyc_valide_le IS NOT NULL
        AND kyc_valide_le < NOW() - INTERVAL '48 hours'
    `)
    if (result > 0) {
      console.log(`🔄 KYC auto-renouvellement : ${result} compte(s) passé(s) en attente`)
    }
  } catch(e) {
    console.warn('KYC job erreur:', e.message)
  }
}, 60 * 60 * 1000) // toutes les heures

console.log('⏱️  Job KYC auto-renouvellement actif (vérification toutes les heures)')

// ── Job anti-triche : détecter les remboursements filleul → parrain dans les 7 jours ──
// Toutes les heures : pour chaque rattachement valide datant de moins de 7 jours,
// on vérifie si le filleul a renvoyé de l'argent à son parrain depuis le rattachement.
// Si oui : c'est la preuve d'un rattachement fictif → détachement automatique + alerte.
// Au-delà de 7 jours sans remboursement détecté, le rattachement est considéré sain
// et n'est plus revérifié (marqué verifie_remboursement = TRUE).
setInterval(async () => {
  try {
    const aSurveiller = await sql(`
      SELECT id::text as id, parrain_id, filleul_id, date_entree::text as "dateEntree"
      FROM rattachements
      WHERE statut = 'valide'
        AND verifie_remboursement = FALSE
        AND date_entree IS NOT NULL
        AND date_entree >= NOW() - INTERVAL '7 days'
    `).catch(() => [])
    for (const r of aSurveiller) {
      const retour = await sql(`
        SELECT t.montant::float as montant, t.date_creation::text as "dateCreation"
        FROM transactions t
        JOIN comptes cs ON cs.id = t.compte_source_id
        JOIN comptes cd ON cd.id = t.compte_dest_id
        WHERE cs.utilisateur_id = $1 AND cd.utilisateur_id = $2
          AND t.type = 'transfert' AND t.statut = 'complete'
          AND t.date_creation >= $3::timestamptz
        ORDER BY t.date_creation DESC LIMIT 1
      `, r.filleul_id, r.parrain_id, r.dateEntree).then(rows => rows[0] || null).catch(() => null)
      if (retour) {
        // Triche confirmée : détacher automatiquement + alerter le back-office
        await pgPool.query(`DELETE FROM rattachements WHERE id = $1`, [r.id]).catch(()=>{})
        await creerAlerteRattachementSuspect(r.parrain_id, r.filleul_id, retour.montant, retour.dateCreation,
          `Le filleul a renvoyé ${retour.montant} FCFA au parrain dans les 7 jours suivant son rattachement (remboursement = triche confirmée)`)
      }
    }
    // Marquer comme vérifiés (sains) tous les rattachements qui ont dépassé 7 jours sans remboursement détecté
    const cloture = await pgPool.query(`
      UPDATE rattachements SET verifie_remboursement = TRUE
      WHERE statut = 'valide' AND verifie_remboursement = FALSE
        AND date_entree IS NOT NULL AND date_entree < NOW() - INTERVAL '7 days'
    `).catch(() => 0)
    if (aSurveiller.length > 0) console.log(`🕵️  Anti-triche : ${aSurveiller.length} rattachement(s) sous surveillance (fenêtre 7 jours)`)
  } catch(e) {
    console.warn('Anti-triche job erreur:', e.message)
  }
}, 60 * 60 * 1000) // toutes les heures

console.log('⏱️  Job anti-triche rattachements actif (vérification toutes les heures)')


// ═══════════════════════════════════════════════════════════════
// FLUX ANALYTICS — transferts par catégorie, dépôts, retraits
// GET /api/v1/flux/analytics?period=month&statut=complete
// ═══════════════════════════════════════════════════════════════
app.get('/api/v1/flux/analytics', authMiddleware, role('admin','backoffice','superviseur'), async (req, res) => {
  try {
    const { period = 'month', statut = 'complete', zone } = req.query

    const now = new Date()
    let debut, debutPrev, finPrev
    if (period === 'today') {
      debut     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      debutPrev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      finPrev   = debut
    } else if (period === 'week') {
      debut     = new Date(now); debut.setDate(debut.getDate() - 7)
      debutPrev = new Date(now); debutPrev.setDate(debutPrev.getDate() - 14)
      finPrev   = debut
    } else if (period === 'year') {
      debut     = new Date(now.getFullYear(), 0, 1)
      debutPrev = new Date(now.getFullYear() - 1, 0, 1)
      finPrev   = debut
    } else {
      debut     = new Date(now.getFullYear(), now.getMonth(), 1)
      debutPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      finPrev   = debut
    }

    const statutFilter = statut === 'all' ? '' : `AND t.statut = '${statut.replace(/'/g,"''")}'`
    const zoneFilter   = zone ? `AND (us.zone = '${zone.replace(/'/g,"''")}' OR ud.zone = '${zone.replace(/'/g,"''")}')` : ''

    const baseSQL = (from, to) => `
      SELECT t.type, t.statut, t.montant::float, t.frais::float,
             t.agent_id::text as "agentId",
             t.date_creation as date_creation,
             us.role as "srcRole", ud.role as "destRole",
             us.zone as "srcZone", ud.zone as "destZone"
      FROM transactions t
      LEFT JOIN comptes cs ON cs.id = t.compte_source_id
      LEFT JOIN utilisateurs us ON us.id = cs.utilisateur_id
      LEFT JOIN comptes cd ON cd.id = t.compte_dest_id
      LEFT JOIN utilisateurs ud ON ud.id = cd.utilisateur_id
      WHERE t.date_creation >= $1::timestamptz
        AND t.date_creation < $2::timestamptz
        ${statutFilter}
        ${zoneFilter}
      ORDER BY t.date_creation DESC
      LIMIT 5000`

    const [txns, txnsPrev] = await Promise.all([
      sql(baseSQL(debut, now), debut.toISOString(), now.toISOString()),
      sql(baseSQL(debutPrev, finPrev), debutPrev.toISOString(), finPrev.toISOString())
    ])

    const pairKey = (r1, r2) => [r1||'inconnu', r2||'inconnu'].sort().join('↔')

    const TRANSFER_CATS = [
      'client↔client','agent↔agent','mini_master↔mini_master','master↔master',
      'agent↔mini_master','agent↔master','mini_master↔master',
      'agent↔business','business↔business'
    ]

    const calcStats = (list) => {
      const stats = {}
      TRANSFER_CATS.forEach(c => { stats[c] = { n:0, vol:0 } })
      const depots   = { master:{n:0,vol:0}, mini_master:{n:0,vol:0}, agent:{n:0,vol:0}, autre:{n:0,vol:0} }
      const retraits = { master:{n:0,vol:0}, mini_master:{n:0,vol:0}, agent:{n:0,vol:0}, autre:{n:0,vol:0} }
      const courbe = {}

      list.forEach(tx => {
        const m = Number(tx.montant || 0)
        const sr = tx.srcRole || 'inconnu', dr = tx.destRole || 'inconnu'
        const d = new Date(tx.date_creation)
        let tKey
        if (period === 'today')  tKey = d.getHours() + 'h'
        else if (period === 'week') tKey = d.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit'})
        else if (period === 'year') tKey = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()]
        else tKey = d.getDate().toString()
        if (!courbe[tKey]) courbe[tKey] = {}

        if (tx.type === 'transfert') {
          const pk = pairKey(sr, dr)
          if (stats[pk]) {
            stats[pk].n++; stats[pk].vol += m
            courbe[tKey][pk] = (courbe[tKey][pk] || 0) + m
          }
        } else if (tx.type === 'depot') {
          const bucket = ['master','mini_master','agent'].includes(sr) ? sr : 'autre'
          depots[bucket].n++; depots[bucket].vol += m
          courbe[tKey]['depot_'+bucket] = (courbe[tKey]['depot_'+bucket] || 0) + m
        } else if (tx.type === 'retrait') {
          const bucket = ['master','mini_master','agent'].includes(sr) ? sr : 'autre'
          retraits[bucket].n++; retraits[bucket].vol += m
          courbe[tKey]['retrait_'+bucket] = (courbe[tKey]['retrait_'+bucket] || 0) + m
        }
      })
      return { stats, depots, retraits, courbe }
    }

    const curr = calcStats(txns)
    const prev = calcStats(txnsPrev)

    const evol = (c, p) => !p ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100)

    const CAT_LABELS = {
      'client↔client':'Clients ↔ Clients','agent↔agent':'Agents ↔ Agents',
      'mini_master↔mini_master':'Mini-Masters ↔ Mini-Masters','master↔master':'Masters ↔ Masters',
      'agent↔mini_master':'Mini-Masters ↔ Agents','agent↔master':'Masters ↔ Agents',
      'mini_master↔master':'Masters ↔ Mini-Masters',
      'agent↔business':'Business ↔ Agents','business↔business':'Business ↔ Business'
    }

    const transferts = TRANSFER_CATS.map(id => {
      const c = curr.stats[id]||{n:0,vol:0}, p = prev.stats[id]||{n:0,vol:0}
      return { id, label: CAT_LABELS[id]||id, n:c.n, vol:c.vol,
               avg: c.n>0 ? Math.round(c.vol/c.n) : 0,
               evol_n: evol(c.n,p.n), evol_vol: evol(c.vol,p.vol) }
    })

    const buildFlow = (cur, prv) => {
      const out = {}
      ;['master','mini_master','agent','autre'].forEach(k => {
        const c=cur[k]||{n:0,vol:0}, p=prv[k]||{n:0,vol:0}
        out[k] = { n:c.n, vol:c.vol, avg:c.n>0?Math.round(c.vol/c.n):0, evol_vol:evol(c.vol,p.vol) }
      })
      return out
    }

    return ok(res, {
      periode: period,
      debut: debut.toISOString(),
      transferts,
      depots:   buildFlow(curr.depots,   prev.depots),
      retraits: buildFlow(curr.retraits, prev.retraits),
      courbe:   Object.entries(curr.courbe).map(([label,vals]) => ({label,...vals})),
      total_txns: txns.length,
    })
  } catch(e) { return err(res, e.message, 500) }
})


// ═══════════════════════════════════════════════════════════
// ROUTES SUPPORT TECHNIQUE — logs & historique
// ═══════════════════════════════════════════════════════════

// GET /tech/logs — journal des erreurs techniques
// ═══ JOURNAL DES ACTIONS (traçabilité) ═══
app.get('/api/v1/actions-log', authMiddleware, role('admin','backoffice'), async (req, res) => {
  try {
    const { action, limit=50, offset=0 } = req.query
    const lim = Math.min(parseInt(limit)||50, 200)
    const off = parseInt(offset)||0
    const actionFilter = action && action!=='all' ? `AND action = '${action.replace(/'/g,"''")}'` : ''
    const rows = await sql(
      `SELECT id::text, acteur_nom, acteur_role, acteur_tel,
              action, cible_nom, cible_role, cible_tel, detail,
              created_at
       FROM actions_log
       WHERE 1=1 ${actionFilter}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      lim, off
    )
    const total = await sql(
      `SELECT COUNT(*)::int as n FROM actions_log WHERE 1=1 ${actionFilter}`
    )
    return ok(res, { logs: rows, total: total[0]?.n || 0 })
  } catch(e){ return err(res, e.message, 500) }
})

app.get('/api/v1/tech/logs', authMiddleware, role('admin','backoffice','support_tech'), async (req, res) => {
  try {
    const { type = 'all', limit = 15 } = req.query
    const lim = Math.min(parseInt(limit)||15, 50)
    const results = []

    // Transactions échouées → erreurs API
    if (type === 'all' || type === 'api') {
      try {
        const rows = await sql(
          `SELECT 'api' as type, 'Transaction échouée' as message, reference as detail, date_creation as created_at
           FROM transactions WHERE statut = 'echec' ORDER BY date_creation DESC LIMIT $1`,
          Math.ceil(lim/3)
        )
        rows.forEach(r => results.push({ type:'api', message:r.message, detail:r.detail, created_at:r.created_at }))
      } catch(e) {}
    }

    // Notifications non lues depuis longtemps → erreurs notif
    if (type === 'all' || type === 'notif') {
      try {
        const rows = await sql(
          `SELECT 'notif' as type, 'Notification non lue (ancienne)' as message, titre as detail, created_at
           FROM notifications WHERE lu = false AND created_at < NOW() - INTERVAL '7 days'
           ORDER BY created_at DESC LIMIT $1`,
          Math.ceil(lim/3)
        )
        rows.forEach(r => results.push({ type:'notif', message:r.message, detail:r.detail, created_at:r.created_at }))
      } catch(e) {}
    }

    // Documents KYC rejetés → erreurs KYC
    if (type === 'all' || type === 'kyc') {
      try {
        const rows = await sql(
          `SELECT 'kyc' as type, 'Documents KYC rejetés' as message,
                  u.telephone as detail, k.updated_at as created_at
           FROM kyc_documents k
           JOIN utilisateurs u ON u.id = k.utilisateur_id
           WHERE k.statut = 'rejete'
           ORDER BY k.updated_at DESC LIMIT $1`,
          Math.ceil(lim/3)
        )
        rows.forEach(r => results.push({ type:'kyc', message:r.message, detail:r.detail, created_at:r.created_at }))
      } catch(e) {}
    }

    results.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    return ok(res, results.slice(0, lim))
  } catch(e) { return err(res, e.message, 500) }
})

// GET /tech/history — historique des actions techniques
app.get('/api/v1/tech/history', authMiddleware, role('admin','backoffice','support_tech'), async (req, res) => {
  try {
    const { limit = 15 } = req.query
    const lim = Math.min(parseInt(limit)||15, 50)
    const history = []

    // Transactions complétées ou échouées récentes
    try {
      const rows = await sql(
        `SELECT 'force_txn' as action_type,
                'Transaction ' || reference || ' → ' || statut as description,
                COALESCE(date_completion, date_creation) as created_at,
                'Support Tech' as auteur
         FROM transactions
         WHERE statut IN ('completee','echec')
         ORDER BY COALESCE(date_completion, date_creation) DESC LIMIT $1`,
        Math.ceil(lim/2)
      )
      rows.forEach(r => history.push(r))
    } catch(e) {}

    // Tickets résolus/fermés par support_tech
    try {
      const rows = await sql(
        `SELECT 'resolve_ticket' as action_type,
                'Ticket ' || reference || ' — ' || statut as description,
                COALESCE(date_resolution, date_creation) as created_at,
                'Support Tech' as auteur
         FROM tickets_support
         WHERE service = 'support_tech' AND statut IN ('resolu','ferme','rejete')
         ORDER BY COALESCE(date_resolution, date_creation) DESC LIMIT $1`,
        Math.ceil(lim/2)
      )
      rows.forEach(r => history.push(r))
    } catch(e) {}

    // Alertes créées par support_tech
    try {
      const rows = await sql(
        `SELECT 'create_alert' as action_type,
                'Alerte créée : ' || titre as description,
                created_at,
                COALESCE(auteur, 'Support Tech') as auteur
         FROM alertes
         WHERE service = 'support_tech'
         ORDER BY created_at DESC LIMIT $1`,
        Math.ceil(lim/3)
      )
      rows.forEach(r => history.push(r))
    } catch(e) {}

    history.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    return ok(res, history.slice(0, lim))
  } catch(e) { return err(res, e.message, 500) }
})

// Migration automatique des colonnes KYC + comptes
async function autoMigrate() {
  const cols = [
    // Colonnes KYC utilisateurs
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_niveau_demande TEXT DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_valide_le TIMESTAMP DEFAULT NULL`,
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_rejete_le TIMESTAMP DEFAULT NULL`,
    // Colonnes comptes — garantir que created_at/updated_at/type_compte/plafond_mensuel existent
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS type_compte TEXT DEFAULT 'client'`,
    `ALTER TABLE comptes ADD COLUMN IF NOT EXISTS plafond_mensuel NUMERIC DEFAULT 20000`,
    // Colonnes kyc_documents — garantir date_soumission et created_at
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_soumission TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS hash_fichier TEXT DEFAULT 'none'`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS commentaire TEXT`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verifie_par TEXT`,
    `ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS date_verification TIMESTAMP`,
    // Colonne FCM token pour push notifications
    `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL`,
  ]
  for (const sqlCol of cols) {
    await pgPool.query(sqlCol).catch(e => console.log('migrate:', e.message))
  }
  console.log('✅ Migration colonnes KYC + comptes OK')
}
autoMigrate()

// Créer table OTP si elle n'existe pas
pgPool.query(`CREATE TABLE IF NOT EXISTS otp_retraits (
  cle text PRIMARY KEY, otp text NOT NULL, amt numeric NOT NULL,
  frais numeric NOT NULL, total numeric NOT NULL, taux numeric NOT NULL,
  client_id text NOT NULL, client_compte_id text NOT NULL,
  client_nom text, agent_id text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT NOW()
)`).then(()=>console.log('✅ otp_retraits OK')).catch(e=>console.warn('otp_retraits:',e.message))

app.listen(PORT, () => console.log(`🚀 AFRIM PAY API v4.20 → port ${PORT}`))

main().catch(e => { console.error('main() erreur:', e.message) })
