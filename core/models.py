# core/models.py — KICEKO ProjectHub
# Ajout : rôles utilisateurs + SWOT synchronisé

from django.db import models
from django.contrib.auth.models import User


# ══════════════════════════════════════════
# RÔLES UTILISATEURS
# ══════════════════════════════════════════

class UserProfile(models.Model):
    """
    Extension du User Django pour gérer les rôles.
    Créé automatiquement à la création de chaque User.
    """
    ROLE_CHOICES = [
        ('admin',   'Administrateur'),   # Voit tout le dashboard
        ('manager', 'Chef de projet'),   # Voit projets + ses tickets
        ('member',  'Membre'),           # Voit uniquement ses projets
    ]

    user       = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role       = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')
    member     = models.ForeignKey('Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='user_account')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Profil utilisateur'
        verbose_name_plural = 'Profils utilisateurs'

    def __str__(self):
        return f"{self.user.username} ({self.role})"

    @property
    def is_admin(self):
        return self.role == 'admin' or self.user.is_superuser

    @property
    def is_manager(self):
        return self.role in ('admin', 'manager') or self.user.is_superuser


# ══════════════════════════════════════════
# MEMBRE D'ÉQUIPE
# ══════════════════════════════════════════

class Member(models.Model):
    name       = models.CharField(max_length=100)
    role       = models.CharField(max_length=100, blank=True)
    initials   = models.CharField(max_length=3)
    color      = models.CharField(max_length=20, default='#e8a020')
    email      = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


# ══════════════════════════════════════════
# PROJET
# ══════════════════════════════════════════

class Project(models.Model):
    STATUS_CHOICES = [
        ('Planifié',   'Planifié'),
        ('En cours',   'En cours'),
        ('En attente', 'En attente'),
        ('Bloqué',     'Bloqué'),
        ('Terminé',    'Terminé'),
    ]
    CAT_CHOICES = [
        ('IT',         'Informatique'),
        ('GIS',        'SIG / Cartographie'),
        ('AO',         'Appel d\'offres'),
        ('Interne',    'Interne'),
        ('Partenariat','Partenariat'),
    ]

    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category    = models.CharField(max_length=50, choices=CAT_CHOICES, default='IT')
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Planifié')
    progress    = models.IntegerField(default=0)
    deadline    = models.DateField(null=True, blank=True)
    members     = models.ManyToManyField(Member, blank=True, related_name='projects')
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_projects')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


# ══════════════════════════════════════════
# MATRICE SWOT (synchronisée au projet)
# ══════════════════════════════════════════

class SWOTMatrix(models.Model):
    """
    Matrice SWOT intelligente liée à un projet.
    Chaque item peut être saisi manuellement OU généré automatiquement
    depuis les données du projet (progress, risques, bugs, deadlines...).
    """
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name='swot')

    # Forces (Strengths) — JSON list
    strengths    = models.JSONField(default=list, blank=True)
    # Faiblesses (Weaknesses)
    weaknesses   = models.JSONField(default=list, blank=True)
    # Opportunités (Opportunities)
    opportunities = models.JSONField(default=list, blank=True)
    # Menaces (Threats)
    threats      = models.JSONField(default=list, blank=True)

    # Méta
    auto_generated = models.BooleanField(default=False)
    last_sync      = models.DateTimeField(auto_now=True)
    notes          = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Matrice SWOT'

    def __str__(self):
        return f"SWOT — {self.project.name}"

    def auto_generate(self):
        """
        Génère intelligemment le SWOT à partir des données du projet :
        - work_items (bugs, stories, epics...)
        - progress vs deadline
        - membres assignés
        - statut du projet
        """
        from datetime import date

        p        = self.project
        wi       = p.work_items.all()
        now      = date.today()

        done_pct    = p.progress or 0
        total_wi    = wi.count()
        done_wi     = wi.filter(status='Terminé').count()
        open_bugs   = wi.filter(type='bug', status__in=['Backlog','A faire','En cours']).count()
        high_prio   = wi.filter(priority='Haute', status__in=['Backlog','A faire']).count()
        team_size   = p.members.count()

        # ── FORCES ──
        s = []
        if done_pct >= 70:
            s.append(f"Avancement solide : {done_pct}% complété")
        if team_size >= 3:
            s.append(f"Équipe mobilisée : {team_size} membres assignés")
        if done_wi > 0:
            s.append(f"{done_wi} tâches livrées avec succès")
        if p.status == 'En cours':
            s.append("Projet actif et en progression")
        if open_bugs == 0 and total_wi > 0:
            s.append("Aucun bug ouvert — qualité maîtrisée")
        if not s:
            s.append("Projet structuré avec équipe dédiée")

        # ── FAIBLESSES ──
        w = []
        if done_pct < 30:
            w.append(f"Avancement faible : seulement {done_pct}% complété")
        if open_bugs >= 2:
            w.append(f"{open_bugs} bugs non résolus impactent la qualité")
        if high_prio >= 3:
            w.append(f"{high_prio} items haute priorité en attente")
        if team_size < 2:
            w.append("Équipe réduite — risque de surcharge")
        if p.status == 'Bloqué':
            w.append("Projet actuellement bloqué — nécessite déblocage urgent")
        if not p.deadline:
            w.append("Pas de deadline définie — manque de cadrage temporel")
        if not w:
            w.append("Points d'amélioration à identifier")

        # ── OPPORTUNITÉS ──
        o = []
        if p.category == 'GIS':
            o.append("Forte demande en solutions SIG en Afrique centrale")
        if p.category == 'IT':
            o.append("Digitalisation croissante des institutions au Tchad")
        if p.category == 'AO':
            o.append("Pipeline d'appels d'offres actifs — potentiel commercial fort")
        if team_size >= 2:
            o.append("Compétences pluridisciplinaires valorisables")
        if p.deadline and (p.deadline - now).days > 30:
            o.append("Marge temporelle disponible pour ajuster la stratégie")
        o.append("Visibilité KICEKO auprès des partenaires internationaux")
        if not o:
            o.append("Contexte favorable à l'expansion des activités")

        # ── MENACES ──
        t = []
        if p.deadline:
            days_left = (p.deadline - now).days
            if days_left < 0:
                t.append(f"Deadline dépassée de {abs(days_left)} jours — retard critique")
            elif days_left <= 7:
                t.append(f"Deadline dans {days_left} jours — pression élevée")
            elif days_left <= 14:
                t.append(f"Délai serré : {days_left} jours restants")
        if open_bugs >= 3:
            t.append("Accumulation de bugs — risque de dette technique")
        if p.status == 'En attente':
            t.append("Dépendances externes non résolues")
        t.append("Contraintes budgétaires des partenaires")
        t.append("Concurrence sur les appels d'offres internationaux")
        if not t:
            t.append("Risques externes à surveiller")

        self.strengths     = s[:5]
        self.weaknesses    = w[:5]
        self.opportunities = o[:5]
        self.threats       = t[:5]
        self.auto_generated = True
        self.save()


# ══════════════════════════════════════════
# WORK ITEM (ticket)
# ══════════════════════════════════════════

class WorkItem(models.Model):
    TYPE_CHOICES = [
        ('epic',    'Epic'),
        ('feature', 'Feature'),
        ('story',   'Story'),
        ('task',    'Tâche'),
        ('bug',     'Bug'),
    ]
    STATUS_CHOICES = [
        ('Backlog',  'Backlog'),
        ('A faire',  'À faire'),
        ('En cours', 'En cours'),
        ('Review',   'Review'),
        ('Terminé',  'Terminé'),
    ]
    PRIORITY_CHOICES = [
        ('Basse',   'Basse'),
        ('Moyenne', 'Moyenne'),
        ('Haute',   'Haute'),
    ]

    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    type        = models.CharField(max_length=20, choices=TYPE_CHOICES, default='task')
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Backlog')
    priority    = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='Moyenne')
    pts         = models.IntegerField(default=5)
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='work_items', null=True, blank=True)
    assignee    = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, blank=True, related_name='work_items')
    sprint      = models.ForeignKey('Sprint', on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    due         = models.DateField(null=True, blank=True)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title


# ══════════════════════════════════════════
# TENDER (Appel d'offres)
# ══════════════════════════════════════════

class Tender(models.Model):
    STATUS_CHOICES = [
        ('Détection',     'Détection'),
        ('Qualification', 'Qualification'),
        ('Préparation',   'Préparation'),
        ('Soumis',        'Soumis'),
        ('Gagné',         'Gagné'),
        ('Perdu',         'Perdu'),
    ]

    title    = models.CharField(max_length=200)
    org      = models.CharField(max_length=200)
    amount   = models.BigIntegerField(default=0)
    deadline = models.DateField(null=True, blank=True)
    status   = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Détection')
    lead     = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, blank=True, related_name='tenders')
    notes    = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.org} — {self.title}"


# ══════════════════════════════════════════
# SPRINT
# ══════════════════════════════════════════

class Sprint(models.Model):
    STATUS_CHOICES = [
        ('Planifié',  'Planifié'),
        ('En cours',  'En cours'),
        ('Terminé',   'Terminé'),
    ]

    name      = models.CharField(max_length=100)
    project   = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sprints', null=True, blank=True)
    status    = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Planifié')
    start     = models.DateField(null=True, blank=True)
    end       = models.DateField(null=True, blank=True)
    pts_total = models.IntegerField(default=0)
    pts_done  = models.IntegerField(default=0)
    goal      = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start']

    def __str__(self):
        return self.name


# ── Signal : créer automatiquement le profil et le SWOT ──
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.get_or_create(user=instance)
        # Le premier superuser est admin
        if instance.is_superuser:
            instance.profile.role = 'admin'
            instance.profile.save()

@receiver(post_save, sender=Project)
def create_swot_on_project(sender, instance, created, **kwargs):
    """Crée et auto-génère le SWOT à chaque création/màj de projet"""
    swot, new = SWOTMatrix.objects.get_or_create(project=instance)
    # Régénère si nouveau projet ou si le SWOT est vide
    if new or (not swot.strengths and not swot.weaknesses):
        swot.auto_generate()