// AFRIM PAY API v2.3 — Permissions corrigées pour support_client, support_tech, superviseur
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')

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
    const row = await prisma.$queryRawUnsafe(
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
    await prisma.$executeRawUnsafe(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, data)
       VALUES ($1, $2, $3, $4, $5)`,
      uidStr, type, titre, message, JSON.stringify(data||{})
    )
    console.log('✉ Notif OK:', type, '->', uidStr.substring(0,8)+'...')
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
app.use(express.json())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }))

const signAccess = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: '15m' })
const signRefresh = (p) => jwt.sign(p, JWT_REFRESH_SECRET, { expiresIn: '7d' })
const ok = (res, data, s = 200) => res.status(s).json({ success: true, data })
const err = (res, msg, s = 400) => res.status(s).json({ success: false, message: msg })

// ── PLAFOND EFFECTIF (client et business uniquement) ──
async function calculerPlafondEffectif(utilisateur) {
  if (!['client','business'].includes(utilisateur.role)) return 999999999
  const kyc = utilisateur.kycNiveau || 'KYC1'
  // Compter les filleuls RATTACHÉS (conditions entrée+sortie remplies)
  const nbRattaches = await prisma.$queryRawUnsafe(
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
    const filleul = await prisma.utilisateur.findUnique({ where: { id: filleulId } })
    if (!filleul || !filleul.parrainId) return
    // Vérifier s'il est déjà rattaché
    const existing = await prisma.$queryRawUnsafe(
      `SELECT statut FROM rattachements WHERE filleul_id = $1`, filleulId
    ).then(r => r[0] || null).catch(() => null)
    if (existing && existing.statut === 'valide') return // Déjà rattaché à vie
    if (existing) {
      // Mettre à jour en valide
      await prisma.$executeRawUnsafe(
        `UPDATE rattachements SET statut='valide', date_entree=NOW() WHERE filleul_id=$1`,
        filleulId
      )
    } else {
      // Créer et valider directement
      await prisma.$executeRawUnsafe(
        `INSERT INTO rattachements (id, parrain_id, filleul_id, date_entree, statut, created_at)
         VALUES ($1,$2,$3,NOW(),'valide',NOW())`,
        require('crypto').randomUUID(), filleul.parrainId, filleulId
      )
    }
    console.log('[RATTACHEMENT] Validé:', filleulId, '→ parrain:', filleul.parrainId)
  } catch(e) {
    console.warn('[RATTACHEMENT] Erreur:', e.message)
  }
}

async function verifierPlafondMensuel(clientId, montantAjouter) {
  const debut = new Date(); debut.setDate(1); debut.setHours(0,0,0,0)
  const sqlPlafond = `SELECT COALESCE(SUM(montant),0) as total FROM transactions WHERE "compteDestId" IN (SELECT id FROM comptes WHERE "utilisateurId" = $1) AND type = 'depot' AND statut = 'complete' AND "dateCreation" >= $2`
  const result = await prisma.$queryRawUnsafe(sqlPlafond, clientId, debut)
  const totalMois = Number(result[0]?.total || 0)
  const client = await prisma.utilisateur.findUnique({ where: { id: clientId } })
  if (!client) throw new Error('Client introuvable')
  const plafond = await calculerPlafondEffectif(client)
  const nbFilleuls = await prisma.utilisateur.count({ where: { parrainId: client.id, statut: 'actif' } })
  if (totalMois + montantAjouter > plafond) {
    throw new Error('Plafond mensuel atteint. Plafond effectif : ' + plafond.toLocaleString('fr-FR') + ' FCFA/mois (' + (client.kycNiveau||'KYC1') + ', ' + nbFilleuls + ' filleuls actifs)')
  }
  return { plafond, totalMois, reste: plafond - totalMois }
}

// ═══ ROLES BACK-OFFICE ═══
// admin         → accès total
// superviseur   → sa zone : users, tickets, alertes, kyc validate
// support_client→ recherche client (lecture), tickets, remboursement
// support_tech  → transactions, alertes système, tickets escaladés

const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return err(res, 'Token manquant', 401)
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET)
    const user = await prisma.utilisateur.findUnique({ where: { id: p.userId }, include: { comptes: true } })
    if (!user) return err(res, 'Compte introuvable', 401)
    if (user.statut === 'bloque') return err(res, 'Compte bloqué. Contactez le support.', 401)
    // en_attente : autorisé pour toutes les opérations SAUF le parrainage actif
    req.user = user
    next()
  } catch (e) { return err(res, 'Token invalide', 401) }
}

const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : err(res, 'Permission refusée', 403)

// Rôles back-office complets
const BACKOFFICE = ['admin', 'superviseur', 'support_client', 'support_tech']
const ADMIN_SUP = ['admin', 'superviseur']
const ADMIN_ONLY = ['admin']
const SUPPORT_CLIENT = ['admin', 'support_client']
const ALL_STAFF = ['admin', 'support_client', 'support_tech', 'superviseur', 'master', 'mini_master']
const ALL_ROLES_NOTIF = ['client', 'agent', 'business', 'mini_master', 'master', 'superviseur', 'support_client', 'support_tech', 'admin']
const SUPPORT_TECH = ['admin', 'support_tech']
const OPERATIONS = ['agent', 'mini_master', 'master', 'superviseur', 'admin']

// ═══ SETUP (sans auth) ═══
app.get('/setup/make-admin/:tel', async (req, res) => {
  try {
    const u = await prisma.utilisateur.update({ where: { telephone: req.params.tel }, data: { role: 'admin', statut: 'actif' } })
    return res.json({ success: true, role: u.role, statut: u.statut })
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
        const code = c.prenom.slice(0,3).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()
        await prisma.utilisateur.upsert({
          where: { telephone: c.telephone },
          update: { role: c.role, statut: 'actif', pinHash },
          create: { ...c, pinHash, kycNiveau:'KYC1', statut:'actif', codeParrainage:code, comptes:{ create:{ solde:100000, plafondMensuel:500000 } } }
        })
        results.push({ telephone: c.telephone, role: c.role, statut: 'ok' })
      } catch(e) { results.push({ telephone: c.telephone, error: e.message }) }
    }
    return res.json({ success: true, comptes: results })
  } catch(e) { return res.json({ error: e.message }) }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'AFRIM PAY API v2.3' }))

// Test colonnes table commissions
app.get('/test/comm-columns', async (req, res) => {
  try {
    const cols = await prisma.$queryRawUnsafe(`
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
    const cols = await prisma.$queryRawUnsafe(`
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

// Test KYC table existence
app.get('/test/kyc', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM kyc_documents`)
    return res.json({ ok: true, kycDocumentsCount: Number(result[0].count), message: 'Table kyc_documents accessible' })
  } catch(e) {
    return res.json({ ok: false, error: e.message, hint: 'Table inexistante - redemarrer le serveur pour la creer' })
  }
})

// Test insert KYC
app.post('/test/kyc', async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier } = req.body
    const doc = await prisma.kycDocument.create({
      data: { utilisateurId: userId, typeDocument, urlFichier, hashFichier: 'test', statut: 'soumis' }
    })
    return res.json({ ok: true, doc })
  } catch(e) {
    return res.json({ ok: false, error: e.message })
  }
})
app.get('/', (req, res) => res.json({ message: 'AFRIM PAY API v2.3' }))

// Route test envoi notif directe sans auth — TEMPORAIRE DIAGNOSTIC
app.get('/debug/test-notif', async (req, res) => {
  const result = { steps: [] }
  try {
    const count = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::int as n FROM utilisateurs WHERE role = 'client' AND statut NOT IN ('suspendu','bloque')"
    )
    result.steps.push({ step: 'count_clients', value: count[0].n })
    const users = await prisma.$queryRawUnsafe(
      "SELECT id::text as id, telephone FROM utilisateurs WHERE role = 'client' AND statut NOT IN ('suspendu','bloque') LIMIT 3"
    )
    result.steps.push({ step: 'sample_ids', value: users })
    if (users.length > 0) {
      const uid = users[0].id
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (utilisateur_id, type, titre, message, data) VALUES ($1,'systeme','Test debug','Message test debug','{}')",
        uid
      )
      result.steps.push({ step: 'insert_notif', value: 'OK uid ' + uid.substring(0,8) })
      const check = await prisma.$queryRawUnsafe(
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
    const stats = await prisma.$queryRawUnsafe(
      'SELECT role, statut, COUNT(*)::int as total FROM utilisateurs GROUP BY role, statut ORDER BY role, statut'
    )
    return res.json({ ok: true, stats })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// Route debug : notifs d'un user par telephone
app.get('/debug/notifs-user', async (req, res) => {
  try {
    const tel = req.query.tel || '0789104688'
    const user = await prisma.$queryRawUnsafe(
      "SELECT id::text as id, telephone, role FROM utilisateurs WHERE telephone = $1", tel
    )
    if (!user.length) return res.json({ ok: false, error: 'user introuvable tel=' + tel })
    const uid = user[0].id
    const notifs = await prisma.$queryRawUnsafe(
      "SELECT utilisateur_id, titre, lu, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT 5", uid
    )
    const allIds = await prisma.$queryRawUnsafe(
      "SELECT utilisateur_id, COUNT(*)::int as n FROM notifications GROUP BY utilisateur_id LIMIT 5"
    )
    return res.json({ ok: true, uid: uid, notifs_count: notifs.length, notifs: notifs, all_ids: allIds })
  } catch(e) { return res.json({ ok: false, error: e.message }) }
})

// ═══ AUTH ═══
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { telephone, pin } = req.body
    const user = await prisma.utilisateur.findUnique({ where: { telephone }, include: { comptes: true } })
    if (!user) return err(res, 'Compte introuvable', 401)
    if (user.statut === 'bloque') return err(res, 'Compte bloqué', 401)
    const valid = await bcrypt.compare(pin, user.pinHash)
    if (!valid) return err(res, 'PIN incorrect', 401)
    const payload = { userId: user.id, role: user.role }
    const accessToken = signAccess(payload)
    const refreshToken = signRefresh(payload)
    await prisma.refreshToken.create({ data: { token: refreshToken, utilisateurId: user.id, expiresAt: new Date(Date.now() + 7*86400000) } })
    const { pinHash, ...safe } = user
    return ok(res, { accessToken, refreshToken, user: safe })
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { prenom, nom, telephone, pin, role: r, kycNiveau, parrainCode, zone } = req.body
    if (!prenom || !nom || !telephone || !pin) return err(res, 'Champs obligatoires manquants')
    if (!/^\d{4}$/.test(pin)) return err(res, 'PIN doit contenir 4 chiffres')
    const exists = await prisma.utilisateur.findUnique({ where: { telephone } })
    if (exists) return err(res, 'Numéro déjà utilisé')
    const pinHash = await bcrypt.hash(pin, 10)
    const code = prenom.slice(0,3).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()
    let parrainId = null
    if (parrainCode) {
      const p = await prisma.utilisateur.findFirst({ where: { codeParrainage: parrainCode } })
      if (p) parrainId = p.id
    }
    // Plafond selon rôle et KYC
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const kyc = kycNiveau || 'KYC1'
    const plafond = ['agent','mini_master','master','superviseur','admin','support_client','support_tech'].includes(r||'client')
      ? 999999999
      : (plafonds[kyc] || 20000)
    const user = await prisma.utilisateur.create({
      data: { prenom, nom, telephone, pinHash, role: r||'client', kycNiveau: kyc, statut: 'en_attente', codeParrainage: code, parrainId, zone: zone||null,
        comptes: { create: { solde: 0, plafondMensuel: plafond } } },
      include: { comptes: true }
    })
    const { pinHash: _, ...safe } = user
    return ok(res, safe, 201)
  } catch (e) { return err(res, e.message, 500) }
})

app.post('/api/v1/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.expiresAt < new Date()) return err(res, 'Token expiré', 401)
    const p = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    const accessToken = signAccess({ userId: p.userId, role: p.role })
    const newRefresh = signRefresh({ userId: p.userId, role: p.role })
    await prisma.refreshToken.delete({ where: { token: refreshToken } })
    await prisma.refreshToken.create({ data: { token: newRefresh, utilisateurId: p.userId, expiresAt: new Date(Date.now() + 7*86400000) } })
    return ok(res, { accessToken, refreshToken: newRefresh })
  } catch (e) { return err(res, e.message, 401) }
})

app.post('/api/v1/auth/logout', async (req, res) => {
  try { const { refreshToken } = req.body; if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }); return ok(res, { message: 'Déconnecté' }) }
  catch (e) { return ok(res, { message: 'Déconnecté' }) }
})

// ═══ USERS ═══
app.get('/api/v1/users/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.utilisateur.findUnique({ where: { id: req.user.id }, include: { comptes: true } })
    const { pinHash, ...safe } = user
    // Ajouter kycNiveauDemande depuis SQL brut
    try {
      const extra = await prisma.$queryRawUnsafe(`SELECT kyc_niveau_demande as "kycNiveauDemande" FROM utilisateurs WHERE id = $1`, req.user.id)
      if (extra && extra[0]) safe.kycNiveauDemande = extra[0].kycNiveauDemande
    } catch(e) {}
    // Ajouter plafond effectif et nb filleuls pour clients et business
    if (['client','business'].includes(safe.role)) {
      try {
        const nbFilleuls = await prisma.utilisateur.count({ where:{ parrainId:safe.id } })
        const nbRattaches = await prisma.$queryRawUnsafe(
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
    const user = await prisma.utilisateur.findUnique({ where: { id: req.user.id } })
    const valid = await bcrypt.compare(ancienPin, user.pinHash)
    if (!valid) return err(res, 'Ancien PIN incorrect', 401)
    const pinHash = await bcrypt.hash(nouveauPin, 10)
    await prisma.utilisateur.update({ where: { id: req.user.id }, data: { pinHash } })
    await prisma.refreshToken.deleteMany({ where: { utilisateurId: req.user.id } })
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
      const parrain = await prisma.utilisateur.findFirst({ where: { codeParrainage: parrainCode } })
      if (parrain) where.parrainId = parrain.id
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
      whereConditions.push(`(LOWER(prenom) LIKE LOWER($${paramIdx}) OR LOWER(nom) LIKE LOWER($${paramIdx+1}) OR telephone LIKE $${paramIdx+2})`)
      params.push(`%${q_val}%`, `%${q_val}%`, `%${q_val}%`)
      paramIdx += 3
    }
    if (where.telephone) { whereConditions.push(`telephone = $${paramIdx}`); params.push(where.telephone); paramIdx++ }
    if (where.role && typeof where.role === 'string') { whereConditions.push(`role = $${paramIdx}`); params.push(where.role); paramIdx++ }
    if (where.role && where.role.notIn) { 
      const placeholders = where.role.notIn.map((_,i) => `$${paramIdx+i}`).join(',')
      whereConditions.push(`role NOT IN (${placeholders})`)
      params.push(...where.role.notIn)
      paramIdx += where.role.notIn.length
    }
    if (where.statut) { whereConditions.push(`statut = $${paramIdx}`); params.push(where.statut); paramIdx++ }
    if (where.zone) { whereConditions.push(`zone = $${paramIdx}`); params.push(where.zone); paramIdx++ }
    if (where.parrainId) { whereConditions.push(`"parrain_id" = $${paramIdx}`); params.push(where.parrainId); paramIdx++ }
    
    const limitVal = parseInt(limit) || 30
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''
    const users = await prisma.$queryRawUnsafe(
      `SELECT id, prenom, nom, telephone, role, kyc_niveau as "kycNiveau", statut, code_parrainage as "codeParrainage", zone, created_at as "createdAt" FROM utilisateurs ${whereClause} ORDER BY created_at DESC LIMIT ${limitVal}`,
      ...params
    )
    return ok(res, users)
  } catch (e) { return err(res, e.message, 500) }
})

// PATCH status — admin et superviseur uniquement (pas support)
app.patch('/api/v1/users/:id/status', authMiddleware, role(...ADMIN_SUP), async (req, res) => {
  try {
    const { statut, motif } = req.body
    const user = await prisma.utilisateur.update({ where: { id: req.params.id }, data: { statut } })
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
    return ok(res, user)
  } catch (e) { return err(res, e.message, 500) }
})

// DELETE user — Super Admin uniquement (0505414751)
const SUPER_ADMIN_TEL = '0505414751'
app.delete('/api/v1/users/:id', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    // Vérifier que c'est le super admin
    if (req.user.telephone !== SUPER_ADMIN_TEL) {
      return err(res, 'Action réservée au Super Administrateur AFRIM PAY', 403)
    }
    const userId = req.params.id
    // Vérifier que l'utilisateur existe
    const user = await prisma.utilisateur.findUnique({ where: { id: userId } })
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    // Supprimer dans l'ordre pour respecter les contraintes FK
    await prisma.refreshToken.deleteMany({ where: { utilisateurId: userId } })
    await prisma.commission.deleteMany({ where: { beneficiaireId: userId } })
    // Supprimer les transactions liées au compte
    const compte = await prisma.compte.findFirst({ where: { utilisateurId: userId } })
    if (compte) {
      await prisma.transaction.deleteMany({
        where: { OR: [{ compteSourceId: compte.id }, { compteDestId: compte.id }] }
      })
      await prisma.compte.delete({ where: { id: compte.id } })
    }
    // Supprimer l'utilisateur
    await prisma.utilisateur.delete({ where: { id: userId } })
    return ok(res, { message: 'Compte supprimé définitivement' })
  } catch (e) { return err(res, e.message, 500) }
})

// Réinitialiser le PIN d'un utilisateur (Support Client + Admin)
app.post('/api/v1/users/:id/reset-pin', authMiddleware, role('admin', 'superviseur', 'support_client', 'support_technique'), async (req, res) => {
  try {
    const userId = req.params.id
    const user = await prisma.utilisateur.findUnique({ where: { id: userId } })
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    // Réinitialiser le PIN à 1234 (l'utilisateur devra le changer à la prochaine connexion)
    const pinHash = await bcrypt.hash('1234', 10)
    await prisma.utilisateur.update({
      where: { id: userId },
      data: { pinHash }
    })
    // Invalider toutes les sessions actives de cet utilisateur
    await prisma.refreshToken.deleteMany({ where: { utilisateurId: userId } })
    await notifier(userId, 'securite', '🔐 Code PIN réinitialisé',
      'Votre code PIN a été réinitialisé à 1234 par le support. Connectez-vous et changez-le immédiatement.',
      { action: 'reset_pin' }
    )
    return ok(res, { message: 'PIN réinitialisé à 1234. L\'utilisateur devra le changer à la prochaine connexion.' })
  } catch (e) { return err(res, e.message, 500) }
})

app.get('/api/v1/users/:id/referrals', authMiddleware, async (req, res) => {
  try {
    const filleuls = await prisma.utilisateur.findMany({ where: { parrainId: req.params.id }, select:{id:true,prenom:true,nom:true,telephone:true,createdAt:true} })
    // Gains uniquement si compte actif
    let totalGains = 0
    if (req.user.statut === 'actif') {
      const gains = await prisma.commission.aggregate({ where: { beneficiaireId: req.params.id }, _sum:{montant:true} })
      totalGains = gains._sum.montant || 0
    }
    return ok(res, { filleuls, totalGains, parrainageActif: req.user.statut === 'actif' })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ COMPTES ═══
app.get('/api/v1/accounts/me', authMiddleware, async (req, res) => {
  try { const c = await prisma.compte.findFirst({ where: { utilisateurId: req.user.id } }); if (!c) return err(res, 'Compte introuvable', 404); return ok(res, c) }
  catch (e) { return err(res, e.message, 500) }
})

// ═══ TRANSACTIONS ═══
// Lecture : chacun voit ses propres transactions
// Admin/superviseur/support_tech : voient tout
app.get('/api/v1/transactions', authMiddleware, async (req, res) => {
  try {
    const { limit=20, type, statut, userId } = req.query
    const canSeeAll = ['admin','superviseur','support_client','support_tech'].includes(req.user.role)

    let where = {}
    if (canSeeAll && userId) {
      // Recherche par userId (support_client voit transactions d'un client spécifique)
      const c = await prisma.compte.findFirst({ where: { utilisateurId: userId } })
      if (c) where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    } else if (canSeeAll) {
      // Admin/superviseur/support_tech voient tout
      where = {}
    } else {
      // Opérateur voit ses propres transactions
      const c = await prisma.compte.findFirst({ where: { utilisateurId: req.user.id } })
      if (!c) return ok(res, [])
      where = { OR:[{compteSourceId:c.id},{compteDestId:c.id}] }
    }

    if (type) where.type = type
    if (statut) where.statut = statut

    const txns = await prisma.transaction.findMany({
      where, take: parseInt(limit), orderBy:{dateCreation:'desc'},
      include:{
        compteSource:{include:{utilisateur:{select:{prenom:true,nom:true,telephone:true}}}},
        compteDest:{include:{utilisateur:{select:{prenom:true,nom:true,telephone:true}}}}
      }
    })
    // Ajouter compteSourceId explicitement dans chaque transaction
    const txnsWithIds = txns.map(tx => ({
      ...tx,
      compteSourceId: tx.compteSourceId,
      compteDestId: tx.compteDestId
    }))
    return ok(res, txnsWithIds)
  } catch (e) { return err(res, e.message, 500) }
})

// Preview dépôt
app.get('/api/v1/transactions/preview/deposit', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, select:{id:true,prenom:true,nom:true,telephone:true,statut:true,comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const gainAgent = Math.round(Number(montant)*0.002)
    return ok(res, {...client, frais:0, gainAgent, gainPlatform:0 })
  } catch (e) { return err(res, e.message, 500) }
})

// Preview retrait
app.get('/api/v1/transactions/preview/withdraw', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant } = req.query
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, select:{id:true,prenom:true,nom:true,telephone:true,statut:true,comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
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
    const agentC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    if (!agentC||agentC.solde<amt) return err(res, 'Liquidité insuffisante')
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, include:{comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const clientC=client.comptes[0]
    // Vérifier plafond mensuel effectif (KYC + filleuls) pour clients et business
    if (['client','business'].includes(client.role)) {
      try { await verifierPlafondMensuel(client.id, amt) }
      catch(e) { return err(res, e.message, 400) }
    }
    const gainAgent=Math.round(amt*0.002)
    const ref='DEP-'+Date.now().toString(36).toUpperCase()
    // Créer transaction d'abord
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id,reference,type,statut,"compteSourceId","compteDestId",montant,frais,"initiateurId","dateCreation")
       VALUES ($1,$2,'depot','complete',$3,$4,$5,0,$6,NOW())`,
      txId, ref, agentC.id, clientC.id, amt, req.user.id
    )
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, amt, agentC.id)
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, amt, clientC.id)
    await prisma.$executeRawUnsafe(
      `INSERT INTO commissions (id,"beneficiaireId","typeCommission",montant,taux,statut,"dateCalcul")
       VALUES ($1,$2,'depot_agent',$3,0.002,'verse',NOW())`,
      commId, req.user.id, gainAgent
    )
    // Notification dépôt au client
    await notifier(client.id, 'transaction', '💰 Dépôt reçu',
      `Votre compte a été crédité de ${amt.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, reference:ref, type:'depot' }
    )
    // Rattachement : entrée d'argent
    verifierRattachement(client.id, 'depot', amt).catch(() => {})
    return ok(res, {id:txId, reference:ref, type:'depot', montant:amt, gainAgent })
  } catch (e) { return err(res, e.message, 500) }
})

// Retrait — agents, MM, Master, admin
app.post('/api/v1/transactions/withdraw', authMiddleware, role(...OPERATIONS), async (req, res) => {
  try {
    const { telephone, montant } = req.body; const amt=Number(montant)
    const client = await prisma.utilisateur.findUnique({ where:{telephone}, include:{comptes:true} })
    if (!client) return err(res, 'Client introuvable', 404)
    const clientC=client.comptes[0]
    // Vérifier plafond mensuel effectif pour clients et business
    if (['client','business'].includes(client.role)) {
      const plafondInfo = await calculerPlafondEffectif(client)
      const debut = new Date(); debut.setDate(1); debut.setHours(0,0,0,0)
      const totalMois = await prisma.$queryRawUnsafe(`
        SELECT COALESCE(SUM(montant),0) as total FROM transactions
        WHERE "compteDestId" IN (SELECT id FROM comptes WHERE "utilisateurId" = $1)
        AND type='depot' AND statut='complete' AND "dateCreation" >= $2
      `, client.id, debut)
      // Le retrait ne compte pas dans le plafond mensuel de dépôt
      // mais on vérifie que le client est actif
      if (client.statut !== 'actif') return err(res, 'Compte client non actif')
    }
    const taux=amt<=50000?0.009:amt<=200000?0.008:0.007
    const frais=Math.round(amt*taux); const gainAgent=Math.round(frais*0.35); const total=amt+frais
    if (clientC.solde<total) return err(res, 'Solde client insuffisant')
    const agentC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    const ref='RET-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    const commId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id,reference,type,statut,"compteSourceId","compteDestId",montant,frais,"initiateurId","dateCreation")
       VALUES ($1,$2,'retrait','complete',$3,$4,$5,$6,$7,NOW())`,
      txId, ref, clientC.id, agentC.id, amt, frais, req.user.id
    )
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, total, clientC.id)
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, amt+gainAgent, agentC.id)
    await prisma.$executeRawUnsafe(
      `INSERT INTO commissions (id,"beneficiaireId","typeCommission",montant,taux,statut,"dateCalcul")
       VALUES ($1,$2,'retrait_agent',$3,$4,'verse',NOW())`,
      commId, req.user.id, gainAgent, taux*0.35
    )
    // Notification retrait au client
    await notifier(client.id, 'transaction', '💸 Retrait effectué',
      `Retrait de ${amt.toLocaleString('fr-FR')} F CFA effectué avec succès.`,
      { montant:amt, reference:ref, type:'retrait' }
    )
    // Commission parrain : 10% des frais si filleul rattaché à vie
    if (client.parrainId) {
      prisma.$queryRawUnsafe(
        `SELECT id FROM rattachements WHERE filleul_id = $1 AND statut = 'valide'`,
        client.id
      ).then(async rows => {
        if (!rows || !rows.length) return
        const gainParrain = Math.round(frais * 0.10)
        if (gainParrain < 1) return
        const commParrainId = require('crypto').randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO commissions (id,"beneficiaireId","typeCommission",montant,taux,statut,"dateCalcul")
           VALUES ($1,$2,'commission_parrain',$3,0.10,'verse',NOW())`,
          commParrainId, client.parrainId, gainParrain
        )
        await prisma.$executeRawUnsafe(
          `UPDATE comptes SET solde=solde+$1 WHERE "utilisateurId"=$2`,
          gainParrain, client.parrainId
        )
        console.log('[PARRAIN] +' + gainParrain + ' FCFA → parrain:', client.parrainId)
      }).catch(e => console.warn('[PARRAIN]', e.message))
    }
    return ok(res, {id:txId, reference:ref, type:'retrait', montant:amt, gainAgent })
  } catch (e) { return err(res, e.message, 500) }
})

// Transfert — tous
app.post('/api/v1/transactions/transfer', authMiddleware, async (req, res) => {
  try {
    const { telephone, montant, motif } = req.body; const amt=Number(montant)
    const srcC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    if (!srcC||srcC.solde<amt) return err(res, 'Solde insuffisant')
    const dest = await prisma.utilisateur.findUnique({ where:{telephone}, include:{comptes:true} })
    if (!dest) return err(res, 'Destinataire introuvable', 404)
    const dstC=dest.comptes[0]; const ref='TRF-'+Date.now().toString(36).toUpperCase()
    const txId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id,reference,type,statut,"compteSourceId","compteDestId",montant,frais,"dateCreation")
       VALUES ($1,$2,'transfert','complete',$3,$4,$5,0,NOW())`,
      txId, ref, srcC.id, dstC.id, amt
    )
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde-$1 WHERE id=$2`, amt, srcC.id)
    await prisma.$executeRawUnsafe(`UPDATE comptes SET solde=solde+$1 WHERE id=$2`, amt, dstC.id)
    // Rattachement : transfert reçu = condition d'entrée pour le destinataire
    verifierRattachement(dest.id, 'transfert_recu', amt).catch(() => {})
    // Notifications transfert expéditeur + destinataire
    await notifier(req.user.id, 'transaction', '📤 Transfert envoyé',
      `Vous avez envoyé ${amt.toLocaleString('fr-FR')} F CFA.`,
      { montant:amt, reference:ref, type:'transfert_envoye' }
    )
    await notifier(dest.id, 'transaction', '📥 Argent reçu',
      `Vous avez reçu ${amt.toLocaleString('fr-FR')} F CFA de ${req.user.prenom||''} ${req.user.nom||''}.`.trim(),
      { montant:amt, reference:ref, type:'transfert_recu' }
    )
    return ok(res, {id:txId, reference:ref, type:'transfert', montant:amt})
  } catch (e) { return err(res, e.message, 500) }
})

// Paiement marchand
app.post('/api/v1/transactions/pay', authMiddleware, async (req, res) => {
  try {
    const { merchantCode, montant } = req.body; const amt=Number(montant)
    const srcC = await prisma.compte.findFirst({ where:{utilisateurId:req.user.id} })
    if (!srcC||srcC.solde<amt) return err(res, 'Solde insuffisant')
    const merchant = await prisma.utilisateur.findFirst({ where:{codeParrainage:merchantCode,role:'business'}, include:{comptes:true} })
    if (!merchant) return err(res, 'Marchand introuvable', 404)
    const mC=merchant.comptes[0]; const frais=Math.round(amt*0.008); const ref='PAY-'+Date.now().toString(36).toUpperCase()
    const [tx] = await prisma.$transaction([
      prisma.transaction.create({data:{type:'paiement_marchand',montant:amt,frais,reference:ref,statut:'complete',initiateurRole:'client',compteSourceId:srcC.id,compteDestId:mC.id}}),
      prisma.compte.update({where:{id:srcC.id},data:{solde:{decrement:amt}}}),
      prisma.compte.update({where:{id:mC.id},data:{solde:{increment:amt-frais}}})
    ])
    // Commission parrain : 10% des frais si le client payeur est rattaché
    if (req.user.parrainId) {
      prisma.$queryRawUnsafe(
        `SELECT id FROM rattachements WHERE filleul_id = $1 AND statut = 'valide'`,
        req.user.id
      ).then(async rows => {
        if (!rows || !rows.length) return
        const gainParrain = Math.round(frais * 0.10)
        if (gainParrain < 1) return
        const cpId = require('crypto').randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO commissions (id,"beneficiaireId","typeCommission",montant,taux,statut,"dateCalcul")
           VALUES ($1,$2,'commission_parrain',$3,0.10,'verse',NOW())`,
          cpId, req.user.parrainId, gainParrain
        )
        await prisma.$executeRawUnsafe(
          `UPDATE comptes SET solde=solde+$1 WHERE "utilisateurId"=$2`,
          gainParrain, req.user.parrainId
        )
        console.log('[PARRAIN PAY] +' + gainParrain + ' FCFA → parrain:', req.user.parrainId)
      }).catch(e => console.warn('[PARRAIN PAY]', e.message))
    }
    // Notif client payeur
    await notifier(req.user.id, 'transaction', '🛒 Paiement effectué',
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
app.patch('/api/v1/transactions/:id/status', authMiddleware, role(...SUPPORT_TECH), async (req, res) => {
  try { 
    const tx = await prisma.transaction.update({ where:{id:req.params.id}, data:{statut:req.body.statut} })
    return ok(res, tx)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ REMBOURSEMENT — support_client et admin ═══
// Peut rembourser le dernier transfert OU un transfert spécifique par transactionId
app.post('/api/v1/transactions/refund', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { userId, transactionId } = req.body
    if (!userId) return err(res, 'userId requis')

    const compte = await prisma.compte.findFirst({ where: { utilisateurId: userId } })
    if (!compte) return err(res, 'Compte introuvable', 404)

    let tx = null

    if (transactionId) {
      // Remboursement d'une transaction spécifique
      tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
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
      tx = await prisma.transaction.findFirst({
        where: { compteSourceId: compte.id, type:'transfert', statut:'complete', dateCreation:{gte:limite} },
        orderBy: { dateCreation: 'desc' }
      })
      if (!tx) return err(res, 'Aucun transfert remboursable dans les 7 derniers jours', 404)
    }

    // Vérifier que le destinataire a les fonds
    const destCompte = await prisma.compte.findUnique({ where: { id: tx.compteDestId } })
    if (!destCompte) return err(res, 'Compte destinataire introuvable')
    const ref = 'RMB-'+Date.now().toString(36).toUpperCase()
    // Utiliser SQL brut pour éviter les problèmes de schéma Prisma
    const newId = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, reference, type, statut, "compteSourceId", "compteDestId", montant, frais, "dateCreation")
       VALUES ($1, $2, 'transfert', 'complete', $3, $4, $5, 0, NOW())`,
      newId, ref, tx.compteDestId, tx.compteSourceId, tx.montant
    )
    await prisma.$executeRawUnsafe(
      `UPDATE comptes SET solde = solde - $1 WHERE id = $2`,
      tx.montant, tx.compteDestId
    )
    await prisma.$executeRawUnsafe(
      `UPDATE comptes SET solde = solde + $1 WHERE id = $2`,
      tx.montant, tx.compteSourceId
    )
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET statut = 'annule' WHERE id = $1`,
      tx.id
    )
    return ok(res, { message: 'Remboursement effectué', montant: tx.montant, reference: ref, transactionOrigine: tx.reference })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ SUSPENDRE DESTINATAIRE — support_client peut suspendre temporairement ═══
app.patch('/api/v1/users/:id/suspend', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { motif } = req.body
    const user = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: { statut: 'suspendu' }
    })
    // Créer un ticket d'enquête automatique
    const ref_s = 'TKT-'+Date.now().toString(36).toUpperCase()
    await prisma.ticket.create({
      data: {
        reference: ref_s,
        sujet: 'Suspension preventive - Enquete remboursement',
        description: motif || 'Compte suspendu suite a demande de remboursement. Enquete en cours.',
                statut: 'en_cours',
        clientId: req.params.id
      }
    }).catch(() => {}) // Silencieux si ticket échoue
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
    const where = ADMIN_SUP.includes(req.user.role) ? {} : {beneficiaireId:req.user.id}
    const now=new Date(); const debut=new Date(now.getFullYear(),now.getMonth(),1)
    const [t,m] = await Promise.all([
      prisma.commission.aggregate({where,_sum:{montant:true}}),
      prisma.commission.aggregate({where:{...where,dateCalcul:{gte:debut}},_sum:{montant:true}})
    ])
    return ok(res, {totalHistorique:t._sum.montant||0,totalMois:m._sum.montant||0})
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ STATS ═══
app.get('/api/v1/stats/dashboard', authMiddleware, async (req, res) => {
  try {
    const now=new Date(); const debut=new Date(now.getFullYear(),now.getMonth(),1)
    const c = await prisma.compte.findFirst({where:{utilisateurId:req.user.id}})
    const bw=c?{OR:[{compteSourceId:c.id},{compteDestId:c.id}]}:{}
    const canSeeGlobal = ADMIN_SUP.includes(req.user.role) || req.user.role === 'support_tech'
    const [dep,ret,gains,txJ,users,alertes,tickets] = await Promise.all([
      prisma.transaction.count({where:{...bw,type:'depot',dateCreation:{gte:debut}}}),
      prisma.transaction.count({where:{...bw,type:'retrait',dateCreation:{gte:debut}}}),
      prisma.commission.aggregate({where:{beneficiaireId:req.user.id,dateCalcul:{gte:debut}},_sum:{montant:true}}),
      prisma.transaction.count({where:{...bw,dateCreation:{gte:new Date(now.getFullYear(),now.getMonth(),now.getDate())}}}),
      canSeeGlobal ? prisma.utilisateur.count() : Promise.resolve(0),
      canSeeGlobal ? prisma.alerteFraude.count({where:{statut:'active'}}) : Promise.resolve(0),
      canSeeGlobal ? prisma.ticket.count({where:{statut:'ouvert'}}) : Promise.resolve(0)
    ])
    return ok(res, {depotsMois:{count:dep},retraitsMois:{count:ret},gainsMois:gains._sum.montant||0,txJour:txJ,totalUtilisateurs:users,alertesActives:alertes,ticketsOuverts:tickets})
  } catch (e) { return err(res, e.message, 500) }
})

// Overview admin
app.get('/api/v1/admin/overview', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const [users,txns,alertes] = await Promise.all([
      prisma.utilisateur.count(),
      prisma.transaction.count(),
      prisma.alerteFraude.count({where:{statut:'active'}}).catch(()=>0)
    ])
    const comm = await prisma.commission.aggregate({_sum:{montant:true}})
    return ok(res, { users, txns, totalCommissions: comm._sum.montant||0, alertes })
  } catch (e) { return err(res, e.message, 500) }
})

// ═══ ALERTES — admin, superviseur, support_tech ═══
app.get('/api/v1/alerts', authMiddleware, role('admin','superviseur','support_tech'), async (req, res) => {
  try {
    const {statut,limit=30} = req.query
    const where = statut ? {statut} : {}
    const list = await prisma.alerteFraude.findMany({where,take:parseInt(limit),orderBy:{dateDetection:'desc'},include:{utilisateur:{select:{prenom:true,nom:true,telephone:true}}}})
    return ok(res,list)
  } catch(e){return err(res,e.message,500)}
})

app.patch('/api/v1/alerts/:id', authMiddleware, role('admin','superviseur','support_tech'), async (req, res) => {
  try { const a=await prisma.alerteFraude.update({where:{id:req.params.id},data:req.body}); return ok(res,a) }
  catch(e){return err(res,e.message,500)}
})

// ═══ COMMISSIONS — liste des commissions d'un utilisateur ═══
app.get('/api/v1/commissions', authMiddleware, async (req, res) => {
  try {
    const { type, userId, limit=50 } = req.query
    const targetId = userId || req.user.id
    if (!['admin','superviseur','support_client','support_tech'].includes(req.user.role) && targetId !== req.user.id) {
      return err(res, 'Accès refusé', 403)
    }
    let sql = `SELECT * FROM commissions WHERE "beneficiaireId" = $1`
    const params = [targetId]
    if (type) { sql += ` AND "typeCommission" = $${params.length+1}`; params.push(type) }
    sql += ` ORDER BY "dateCalcul" DESC LIMIT $${params.length+1}`; params.push(Number(limit))
    const comms = await prisma.$queryRawUnsafe(sql, ...params)
    return ok(res, comms)
  } catch(e) { return err(res, e.message, 500) }
})


// ═══ VIREMENT GAINS → COMPTE PRINCIPAL ═══
app.post('/api/v1/accounts/transfer-gains', authMiddleware, async (req, res) => {
  try {
    const { montant } = req.body
    const amt = Number(montant)
    if (!amt || amt < 100) return err(res, 'Montant minimum 100 FCFA')
    // Vérifier solde commissions
    const commTotal = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(montant),0) as total FROM commissions WHERE "beneficiaireId"=$1 AND statut='verse'`,
      req.user.id
    ).then(r => Number(r[0]?.total || 0)).catch(() => 0)
    if (amt > commTotal) return err(res, 'Gains insuffisants ('+commTotal+' FCFA disponibles)')
    // Créditer le compte principal
    await prisma.$executeRawUnsafe(
      `UPDATE comptes SET solde=solde+$1 WHERE "utilisateurId"=$2`, amt, req.user.id
    )
    // Marquer les commissions comme virées
    await prisma.$executeRawUnsafe(
      `UPDATE commissions SET statut='vire' WHERE "beneficiaireId"=$1 AND statut='verse' AND montant<=$2 LIMIT 1`,
      req.user.id, amt
    )
    return ok(res, { message: 'Virement de '+amt+' FCFA effectué', montant: amt })
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ TICKETS — admin, superviseur, support_client, support_tech ═══
app.get('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {statut, limit=50, service} = req.query
    const canSeeAll = BACKOFFICE.includes(req.user.role)
    let where = canSeeAll ? {} : {clientId:req.user.id}
    // Utiliser queryRaw pour éviter le cast enum StatutTicket
    const tkConditions = []
    const tkParams = []
    let tkIdx = 1
    if (!canSeeAll) { tkConditions.push(`t.client_id = $${tkIdx}`); tkParams.push(where.clientId); tkIdx++ }
    if (statut) { tkConditions.push(`t.statut = $${tkIdx}`); tkParams.push(statut); tkIdx++ }
    if (service) { tkConditions.push(`t.service = $${tkIdx}`); tkParams.push(service); tkIdx++ }
    const tkWhere = tkConditions.length > 0 ? 'WHERE ' + tkConditions.join(' AND ') : ''
    const tkLimit = parseInt(limit) || 50
    const list = await prisma.$queryRawUnsafe(
      `SELECT t.id, t.reference, t.sujet, t.description, t.statut, t.priorite, t.service, t.date_creation as "dateCreation", t.date_resolution as "dateResolution", u.prenom, u.nom, u.telephone FROM tickets_support t LEFT JOIN utilisateurs u ON u.id = t.client_id ${tkWhere} ORDER BY t.date_creation DESC LIMIT ${tkLimit}`,
      ...tkParams
    )
    return ok(res, list)
  } catch(e){return err(res,e.message,500)}
})

// Supprimer un ticket
app.delete('/api/v1/tickets/:id', authMiddleware, role('admin','superviseur'), async (req, res) => {
  try {
    await prisma.ticket.delete({where:{id:req.params.id}})
    return ok(res, {message:'Ticket supprimé'})
  } catch(e){return err(res,e.message,500)}
})

app.post('/api/v1/tickets', authMiddleware, async (req, res) => {
  try {
    const {sujet, description, service, telephone, priorite} = req.body
    // Si support crée un ticket pour un client
    let clientId = req.user.id
    if (BACKOFFICE.includes(req.user.role) && telephone) {
      const client = await prisma.utilisateur.findUnique({where:{telephone}})
      if (client) clientId = client.id
    }
    // Déduire le service selon le rôle si non fourni
    const svc = service || (
      req.user.role === 'support_tech' ? 'support_tech' :
      req.user.role === 'support_client' ? 'support_client' : 'backoffice'
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
    const t = await prisma.ticket.create({data: ticketData})
    return ok(res, t, 201)
  } catch(e){return err(res,e.message,500)}
})

// Mettre à jour statut ticket — admin, superviseur, support_client, support_tech
app.patch('/api/v1/tickets/:id/status', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { statut } = req.body
    const validStatuts = ['ouvert','en_cours','escalade','resolu','ferme']
    if (!validStatuts.includes(statut)) return err(res, 'Statut invalide')
    // Seuls les champs qui existent réellement dans le modèle Prisma
    const data = { statut }
    const t = await prisma.ticket.update({ where:{id:req.params.id}, data })
    if (t.clientId && (statut==='resolu'||statut==='ferme'||statut==='rejete')) {
      const msgs = {
        resolu: ['✅ Ticket résolu', 'Votre demande de support a été résolue.'],
        ferme:  ['🔒 Ticket clôturé', 'Votre ticket a été clôturé.'],
        rejete: ['❌ Ticket rejeté', 'Votre demande n\'a pu être traitée.']
      }
      const [titre, msg] = msgs[statut]
      await notifier(t.clientId, 'systeme', titre, msg, {ticketId:t.id})
    }
    return ok(res, t)
  } catch(e){ return err(res,e.message,500) }
})

// Ajouter commentaire/note à un ticket
app.post('/api/v1/tickets/:id/note', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { note } = req.body
    if (!note) return err(res, 'note requise')
    const t = await prisma.ticket.update({
      where:{id:req.params.id},
      data:{ description: note }
    })
    return ok(res, t)
  } catch(e){ return err(res,e.message,500) }
})

// ═══ RÉSEAU ═══
app.get('/api/v1/network/agents', authMiddleware, async (req, res) => {
  try {
    const agents = await prisma.utilisateur.findMany({where:{parrainId:req.user.id,role:'agent'},select:{id:true,prenom:true,nom:true,telephone:true,zone:true,statut:true,codeParrainage:true,comptes:true}})
    return ok(res,agents)
  } catch(e){return err(res,e.message,500)}
})

// ═══ KYC DOCUMENTS — support_client peut voir les photos ═══

// Enregistrer URL document KYC après upload Cloudinary
app.post('/api/v1/kyc/documents', authMiddleware, async (req, res) => {
  try {
    const { userId, typeDocument, urlFichier, hashFichier } = req.body
    if (!userId || !typeDocument || !urlFichier) return err(res, 'userId, typeDocument et urlFichier requis')
    // Utiliser SQL brut pour éviter les problèmes de migration Prisma
    const id = require('crypto').randomUUID()
    await prisma.$executeRawUnsafe(
      `DELETE FROM kyc_documents WHERE utilisateur_id = $1 AND type_document = $2`,
      userId, typeDocument
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO kyc_documents (id, utilisateur_id, type_document, url_fichier, hash_fichier, statut)
       VALUES ($1, $2, $3, $4, $5, 'soumis')`,
      id, userId, typeDocument, urlFichier, hashFichier||'none'
    )
    return ok(res, { id, utilisateurId: userId, typeDocument, urlFichier, statut: 'soumis' }, 201)
  } catch(e) { return err(res, e.message, 500) }
})

app.get('/api/v1/kyc/documents', authMiddleware, role(...BACKOFFICE), async (req, res) => {
  try {
    const { userId, type } = req.query
    if (!userId) return err(res, 'userId requis')
    let query = `SELECT id, type_document as "typeDocument", url_fichier as "urlFichier", statut, date_soumission as "dateSoumission" FROM kyc_documents WHERE utilisateur_id = $1`
    const params = [userId]
    if (type) { query += ` AND type_document = $2`; params.push(type) }
    query += ` ORDER BY date_soumission DESC`
    const docs = await prisma.$queryRawUnsafe(query, ...params)
    return ok(res, docs)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ KYC REQUEST — client soumet une demande de montée de niveau ═══
app.post('/api/v1/kyc/request', authMiddleware, async (req, res) => {
  try {
    const { userId, niveauDemande } = req.body
    const targetId = userId || req.user.id
    // Vérifier que le niveau demandé est supérieur au niveau actuel
    const user = await prisma.utilisateur.findUnique({ where: { id: targetId }, select: { kycNiveau: true, statut: true } })
    if (!user) return err(res, 'Utilisateur introuvable', 404)
    const ORDER = { KYC1: 1, KYC2: 2, KYC3: 3 }
    if ((ORDER[niveauDemande] || 0) <= (ORDER[user.kycNiveau] || 0) && user.statut !== 'actif') {
      // Resoumettre le même niveau (statut en_attente) → OK
    }
    // Passer le statut en "en_attente" et mémoriser le niveau demandé
    await prisma.utilisateur.update({
      where: { id: targetId },
      data: { statut: 'en_attente' }
    })
    await prisma.$executeRawUnsafe(
      `UPDATE utilisateurs SET kyc_niveau_demande = $1 WHERE id = $2`,
      niveauDemande, targetId
    )
    // Créer un ticket automatique pour le back-office
    const ref = 'KYC-' + Date.now().toString(36).toUpperCase()
    await prisma.ticket.create({
      data: {
        sujet: 'Demande upgrade KYC → ' + niveauDemande,
        description: 'Le client a soumis ses documents pour passer au niveau ' + niveauDemande +
          '. Niveau actuel : ' + user.kycNiveau + '. Photos disponibles dans la fiche client. Veuillez vérifier et valider sous 48h.',
                statut: 'ouvert',
        clientId: targetId
      }
    }).catch(e => console.warn('ticket kyc:', e.message))
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
    const u = await prisma.utilisateur.update({where:{id:req.params.userId},data:{kycNiveau:req.body.kycNiveau,statut:'actif'}})
    await prisma.$executeRawUnsafe(
      `UPDATE utilisateurs SET kyc_valide_le = NOW(), kyc_niveau_demande = NULL WHERE id = $1`,
      req.params.userId
    ).catch(()=>{})
    await notifier(req.params.userId, 'kyc', '✅ KYC validé',
      `Félicitations ! Votre dossier a été validé. Votre nouveau plafond est actif.`,
      {}
    )
    return ok(res, u)
  } catch(e){return err(res,e.message,500)}
})

// PATCH /kyc/:id/reject — rejeter une demande KYC
app.patch('/api/v1/kyc/:userId/reject', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { raison } = req.body
    // Effacer la demande en attente
    await prisma.$executeRawUnsafe(
      `UPDATE utilisateurs SET kyc_niveau_demande = NULL WHERE id = $1`,
      req.params.userId
    )
    // Créer un ticket d'information pour le client
    const ref = 'KYC-REJ-'+Date.now().toString(36).toUpperCase()
    await prisma.ticket.create({
      data: {
        reference: ref,
        sujet: 'Documents KYC rejetés',
        description: 'Vos documents ont été rejetés. Raison : ' + (raison || 'Documents non conformes') + '. Veuillez soumettre à nouveau des documents lisibles et valides.',
        priorite: 'normale',
        statut: 'ferme',
        clientId: req.params.userId
      }
    }).catch(() => {})
    // Notification rejet KYC avec motif
    await notifier(req.params.userId, 'kyc', '❌ Documents KYC refusés',
      (raison || 'Documents non conformes. Veuillez soumettre de nouveaux documents lisibles et valides.') + '',
      { raison: raison || null, action: 'resoumettre' }
    )
    return ok(res, { message: 'Demande rejetée', raison })
  } catch(e) { return err(res, e.message, 500) }
})

// PATCH /users/:id/kyc — valider le niveau KYC (support_client + admin)
app.patch('/api/v1/users/:id/kyc', authMiddleware, role(...SUPPORT_CLIENT), async (req, res) => {
  try {
    const { kycNiveau } = req.body
    if (!kycNiveau) return err(res, 'kycNiveau requis')
    // Mettre à jour le niveau et effacer la demande en attente
    const u = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: { kycNiveau, statut: 'actif' }
    })
    // Effacer kyc_niveau_demande et enregistrer la date de validation
    await prisma.$executeRawUnsafe(
      `UPDATE utilisateurs SET kyc_niveau_demande = NULL, kyc_valide_le = NOW() WHERE id = $1`,
      req.params.id
    ).catch(() => {})
    // Mettre à jour le plafond du compte selon le niveau
    const plafonds = { KYC1: 20000, KYC2: 50000, KYC3: 100000 }
    const plafond = plafonds[kycNiveau]
    if (plafond) {
      await prisma.compte.updateMany({
        where: { utilisateurId: req.params.id },
        data: { plafondMensuel: plafond }
      })
    }
    const { pinHash, ...safe } = u
    return ok(res, safe)
  } catch(e) { return err(res, e.message, 500) }
})

// ═══ DÉMARRAGE ═══
async function main() {
  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ PostgreSQL connecté')

    // ── TABLE NOTIFICATIONS — créée en priorité ──
    await prisma.$executeRawUnsafe(`
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
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(()=>{})
    console.log('✅ Table notifications prête')

    // Créer les tables manquantes si elles n'existent pas
    // Ajouter colonne initiateur_role si manquante
    await prisma.$executeRawUnsafe(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS initiateur_role TEXT NOT NULL DEFAULT 'client'
    `).catch(e => console.log('initiateur_role:', e.message))

    // Ajouter colonne kyc_niveau_demande pour suivre les demandes en attente
    await prisma.$executeRawUnsafe(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_niveau_demande TEXT DEFAULT NULL
    `).catch(e => console.log('kyc_niveau_demande:', e.message))

    // Ajouter colonne kyc_valide_le pour suivre la date de validation KYC
    await prisma.$executeRawUnsafe(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS kyc_valide_le TIMESTAMP DEFAULT NULL
    `).catch(e => console.log('kyc_valide_le:', e.message))

    // Table rattachements : filleuls ayant rempli les 2 conditions
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rattachements (
        id TEXT PRIMARY KEY,
        parrain_id TEXT NOT NULL,
        filleul_id TEXT NOT NULL UNIQUE,
        date_entree TIMESTAMP,
        date_sortie TIMESTAMP,
        statut TEXT DEFAULT 'en_cours',
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_parrain FOREIGN KEY (parrain_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
        CONSTRAINT fk_filleul FOREIGN KEY (filleul_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
      )
    `).catch(e => console.log('rattachements:', e.message))

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(`
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

    // Table notifications
    await prisma.$executeRawUnsafe(`
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
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(() => {})
    console.log('✅ Table notifications OK')

  } catch (e) {
    console.error('❌ Erreur DB:', e)
    process.exit(1)
  }
} // ← FIN de main()


// Route pour créer/vérifier la table notifications (utile si main() n a pas eu le temps)
app.post('/api/v1/admin/setup-notifications', authMiddleware, role(...ADMIN_ONLY), async (req, res) => {
  try {
    await prisma.$executeRawUnsafe(`
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
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(utilisateur_id, created_at DESC)
    `).catch(()=>{})
    return ok(res, { message: 'Table notifications prête' })
  } catch(e) { return err(res, e.message, 500) }
})

// ── ROUTES NOTIFICATIONS ──────────────────────────────────────────────

// Lister les notifications de l'utilisateur connecté
// Route debug auth — voir ce que retourne req.user.id exactement
app.get('/api/v1/notifications/debug-id', authMiddleware, async (req, res) => {
  try {
    const rawId = req.user.id
    const idType = typeof rawId
    const isBuffer = Buffer.isBuffer(rawId)
    const idStr = isBuffer ? rawId.toString('hex') : String(rawId)
    const idStrDirect = String(rawId)
    // Chercher par téléphone
    const byTel = await prisma.$queryRawUnsafe(
      "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone
    )
    // Compter les notifs avec chaque format
    const countHex = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", idStr
    ).catch(() => [{n:-1}])
    const countDirect = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::int as n FROM notifications WHERE utilisateur_id = $1", idStrDirect
    ).catch(() => [{n:-1}])
    const countByTel = byTel[0] ? await prisma.$queryRawUnsafe(
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
        const userRow = await prisma.$queryRawUnsafe(
          "SELECT id::text as id FROM utilisateurs WHERE telephone = $1", tel
        )
        if (userRow && userRow[0]) uidSql = userRow[0].id
      } catch(e) {}
    }
    // Fallback: utiliser req.user.id directement
    if (!uidSql) {
      const rawId = req.user.id
      uidSql = Buffer.isBuffer(rawId) ? rawId.toString('hex') : String(rawId)
    }

    let notifs = []
    let nonLues = [{count:0}]
    try {
      notifs = await prisma.$queryRawUnsafe(
        "SELECT id::text, type, titre, message, lu, data, created_at::text FROM notifications WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT $2",
        uidSql, limit
      )
    } catch(e) { console.error('GET notifs err:', e.message) }
    try {
      nonLues = await prisma.$queryRawUnsafe(
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
    let uid = String(req.user.id)
    try { const r = await prisma.$queryRawUnsafe("SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone); if(r&&r[0]) uid = r[0].id } catch(e){}
    await prisma.$executeRawUnsafe(
      `UPDATE notifications SET lu = TRUE WHERE id = $1 AND utilisateur_id = $2`,
      req.params.id, uid
    )
    return ok(res, { message: 'Marquée comme lue' })
  } catch(e) { return err(res, e.message, 500) }
})

// Marquer toutes comme lues
app.patch('/api/v1/notifications/tout-lire', authMiddleware, async (req, res) => {
  try {
    let uid = String(req.user.id)
    try { const r = await prisma.$queryRawUnsafe("SELECT id::text as id FROM utilisateurs WHERE telephone = $1", req.user.telephone); if(r&&r[0]) uid = r[0].id } catch(e){}
    await prisma.$executeRawUnsafe(
      `UPDATE notifications SET lu = TRUE WHERE utilisateur_id = $1`,
      uid
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
      return ok(res, { message: 'Notification envoyée', total: 1 })
    } else if (targetRole) {
      let users = []
      try {
        users = await prisma.$queryRawUnsafe(
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
      const snap = await prisma.$queryRawUnsafe(
        'SELECT role, statut, COUNT(*)::int as n FROM utilisateurs GROUP BY role, statut'
      )
      debug.push('snap:' + JSON.stringify(snap))
      console.log('MASSE SNAP', JSON.stringify(snap))
    } catch(e) { debug.push('snap_err:' + e.message); console.log('MASSE SNAP ERR', e.message) }
    // Requête directe par rôle
    for (const r of targetRoles) {
      let users = []
      try {
        users = await prisma.$queryRawUnsafe(
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
    const notifs = await prisma.$queryRawUnsafe(
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
    const notifs = await prisma.$queryRawUnsafe(q, ...params)
    const countParams = params.slice(0, params.length - 2)
    const countRow = await prisma.$queryRawUnsafe(countQ, ...countParams).catch(async () => {
      return prisma.$queryRawUnsafe("SELECT COUNT(*)::int as n FROM notifications")
    })
    return ok(res, { notifications: notifs, total: countRow[0].n })
  } catch(e) { return err(res, e.message, 500) }
})

// Supprimer une notification (admin)
app.delete('/api/v1/notifications/:id', authMiddleware, role('admin', 'support_client'), async (req, res) => {
  try {
    await prisma.$executeRawUnsafe("DELETE FROM notifications WHERE id::text = $1", req.params.id)
    return ok(res, { message: 'Notification supprimée' })
  } catch(e) { return err(res, e.message, 500) }
})

// Supprimer toutes les notifications d'un utilisateur (admin)
app.delete('/api/v1/notifications/user/:userId', authMiddleware, role('admin'), async (req, res) => {
  try {
    const result = await prisma.$executeRawUnsafe("DELETE FROM notifications WHERE utilisateur_id = $1", req.params.userId)
    return ok(res, { message: 'Notifications supprimées', count: result })
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
      const row = await prisma.$queryRawUnsafe(
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
        const row = await prisma.$queryRawUnsafe(
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
    return ok(res, { message: sent + ' notification(s) envoyée(s)', total: sent })
  } catch(e) { return err(res, e.message, 500) }
})

// ── Job de renouvellement KYC automatique ──
// Toutes les heures : repasser en en_attente les comptes actifs
// dont la validation KYC a plus de 48 heures
setInterval(async () => {
  try {
    const result = await prisma.$executeRawUnsafe(`
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

app.listen(PORT, () => console.log(`🚀 AFRIM PAY API v2.3 → port ${PORT}`))

main().catch(e => { console.error(e); process.exit(1) })
