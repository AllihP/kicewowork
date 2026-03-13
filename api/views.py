# api/views.py — KICEKO ProjectHub
# Système RBAC + SWOT intelligent
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from django.contrib.auth.models import User
from django.db.models import Count, Q
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Member, Project, WorkItem, Tender, Sprint, UserProfile, SWOTMatrix
from .serializers import (
    MemberSerializer, ProjectSerializer, WorkItemSerializer,
    TenderSerializer, SprintSerializer, UserProfileSerializer, SWOTSerializer
)


# ══════════════════════════════════════════
# PERMISSIONS PERSONNALISÉES
# ══════════════════════════════════════════

class IsAdminRole(BasePermission):
    """Seuls les admins peuvent accéder"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.profile.role == 'admin'
        except Exception:
            return False

class IsManagerOrAdmin(BasePermission):
    """Admins et managers"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.profile.role in ('admin', 'manager')
        except Exception:
            return False


def get_user_role(user):
    """Retourne le rôle de l'utilisateur sous forme de string"""
    if user.is_superuser:
        return 'admin'
    try:
        return user.profile.role
    except Exception:
        return 'member'


def get_user_member(user):
    """Retourne le Member lié à cet utilisateur (ou None)"""
    try:
        return user.profile.member
    except Exception:
        return None


# ══════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    from django.contrib.auth import authenticate
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    user = authenticate(username=username, password=password)
    if not user:
        return Response({'detail': 'Identifiants incorrects'}, status=status.HTTP_401_UNAUTHORIZED)

    refresh = RefreshToken.for_user(user)
    role    = get_user_role(user)
    member  = get_user_member(user)

    return Response({
        'access':  str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id':              user.id,
            'username':        user.username,
            'first_name':      user.first_name,
            'last_name':       user.last_name,
            'email':           user.email,
            'role':            role,
            'is_admin':        role == 'admin',
            'is_manager':      role in ('admin', 'manager'),
            'member_id':       member.id if member else None,
            'member_initials': member.initials if member else user.username[:2].upper(),
            'member_color':    member.color if member else '#e8a020',
        }
    })

@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    user   = request.user
    role   = get_user_role(user)
    member = get_user_member(user)
    return Response({
        'id':              user.id,
        'username':        user.username,
        'first_name':      user.first_name,
        'last_name':       user.last_name,
        'email':           user.email,
        'role':            role,
        'is_admin':        role == 'admin',
        'is_manager':      role in ('admin', 'manager'),
        'member_id':       member.id if member else None,
        'member_initials': member.initials if member else user.username[:2].upper(),
        'member_color':    member.color if member else '#e8a020',
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """Inscription — rôle par défaut : member"""
    username   = request.data.get('username', '').strip()
    password   = request.data.get('password', '')
    first_name = request.data.get('first_name', '')
    last_name  = request.data.get('last_name', '')
    email      = request.data.get('email', '')
    role       = request.data.get('role', 'member')

    # Seuls les admins peuvent créer des admins
    if role == 'admin':
        if not request.user.is_authenticated or get_user_role(request.user) != 'admin':
            role = 'member'

    if User.objects.filter(username=username).exists():
        return Response({'detail': 'Ce nom d\'utilisateur existe déjà'}, status=400)

    user = User.objects.create_user(
        username=username, password=password,
        first_name=first_name, last_name=last_name, email=email
    )
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.role = role
    profile.save()

    refresh = RefreshToken.for_user(user)
    return Response({
        'access':  str(refresh.access_token),
        'refresh': str(refresh),
        'user': {'id': user.id, 'username': user.username, 'role': role}
    }, status=201)


# ══════════════════════════════════════════
# DASHBOARD — Admins uniquement
# ══════════════════════════════════════════
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    role = get_user_role(request.user)

    # Dashboard complet pour admins/managers
    if role in ('admin', 'manager'):
        from django.utils import timezone
        from datetime import timedelta

        projects  = Project.objects.all()
        work_items = WorkItem.objects.all()
        tenders   = Tender.objects.all()
        sprints   = Sprint.objects.filter(status='En cours')

        wi_by_status = {}
        for s in ['Backlog','A faire','En cours','Review','Terminé']:
            wi_by_status[s] = work_items.filter(status=s).count()

        ao_by_status = {}
        for s in ['Détection','Qualification','Préparation','Soumis','Gagné','Perdu']:
            ao_by_status[s] = tenders.filter(status=s).count()

        sp = sprints.first()
        active_sprint = None
        if sp:
            active_sprint = {
                'id': sp.id, 'name': sp.name, 'status': sp.status,
                'start': sp.start, 'end': sp.end,
                'pts_total': sp.pts_total, 'pts_done': sp.pts_done,
            }

        return Response({
            'role':            role,
            'active_items':    work_items.filter(status='En cours').count(),
            'active_projects': projects.filter(status='En cours').count(),
            'done_items':      work_items.filter(status='Terminé').count(),
            'total_tenders':   tenders.exclude(status__in=['Gagné','Perdu']).count(),
            'backlog_items':   work_items.filter(status='Backlog').count(),
            'total_members':   Member.objects.count(),
            'items_by_status': wi_by_status,
            'ao_by_status':    ao_by_status,
            'active_sprint':   active_sprint,
            'recent_projects': list(projects.order_by('-updated_at')[:5].values(
                'id','name','status','progress','deadline','category'
            )),
            'velocity_current': sp.pts_done if sp else 0,
        })

    # Dashboard simplifié pour les membres
    else:
        member = get_user_member(request.user)
        if member:
            my_projects = member.projects.all()
            my_wi = WorkItem.objects.filter(assignee=member)
        else:
            my_projects = Project.objects.none()
            my_wi = WorkItem.objects.none()

        return Response({
            'role':          role,
            'my_projects':   list(my_projects.values('id','name','status','progress','deadline')),
            'my_tasks':      list(my_wi.filter(status__in=['En cours','A faire']).values('id','title','status','priority','due')),
            'done_tasks':    my_wi.filter(status='Terminé').count(),
            'active_tasks':  my_wi.filter(status='En cours').count(),
        })


# ══════════════════════════════════════════
# GESTION DES UTILISATEURS (admin only)
# ══════════════════════════════════════════
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminRole])
def users_list_view(request):
    """Liste tous les utilisateurs avec leur rôle — admin only"""
    users = User.objects.select_related('profile', 'profile__member').all()
    data = []
    for u in users:
        role   = get_user_role(u)
        member = get_user_member(u)
        data.append({
            'id':         u.id,
            'username':   u.username,
            'first_name': u.first_name,
            'last_name':  u.last_name,
            'email':      u.email,
            'role':       role,
            'is_active':  u.is_active,
            'member_id':  member.id if member else None,
            'member_name':member.name if member else None,
            'date_joined':u.date_joined,
        })
    return Response(data)

@csrf_exempt
@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsAdminRole])
def update_user_role(request, user_id):
    """Changer le rôle d'un utilisateur — admin only"""
    try:
        user    = User.objects.get(id=user_id)
        role    = request.data.get('role')
        member_id = request.data.get('member_id')

        valid_roles = ['admin', 'manager', 'member']
        if role not in valid_roles:
            return Response({'detail': 'Rôle invalide'}, status=400)

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role

        if member_id:
            try:
                profile.member = Member.objects.get(id=member_id)
            except Member.DoesNotExist:
                pass

        profile.save()

        # Sync is_staff pour les admins
        user.is_staff = (role == 'admin')
        user.save()

        return Response({'detail': 'Rôle mis à jour', 'role': role})
    except User.DoesNotExist:
        return Response({'detail': 'Utilisateur introuvable'}, status=404)


# ══════════════════════════════════════════
# PROJETS — filtrés par rôle
# ══════════════════════════════════════════

class ProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = ProjectSerializer

    def get_queryset(self):
        user   = self.request.user
        role   = get_user_role(user)
        member = get_user_member(user)

        # Admins et managers voient tout
        if role in ('admin', 'manager'):
            return Project.objects.prefetch_related('members').all()

        # Les membres ne voient que leurs projets
        if member:
            return Project.objects.filter(members=member).prefetch_related('members')

        return Project.objects.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in ('admin', 'manager'):
            return Response({'detail': 'Permission refusée'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role != 'admin':
            return Response({'detail': 'Seuls les admins peuvent supprimer des projets'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def kanban(self, request, pk=None):
        project = self.get_object()
        cols = ['Backlog','A faire','En cours','Review','Terminé']
        data = {}
        for col in cols:
            items = project.work_items.filter(status=col).select_related('assignee')
            data[col] = WorkItemSerializer(items, many=True).data
        return Response(data)

    @action(detail=True, methods=['get'])
    def swot(self, request, pk=None):
        """Retourne le SWOT du projet — auto-génère si nécessaire"""
        project = self.get_object()
        swot, created = SWOTMatrix.objects.get_or_create(project=project)
        if created or (not swot.strengths and not swot.weaknesses):
            swot.auto_generate()
        return Response(SWOTSerializer(swot).data)

    @action(detail=True, methods=['post'])
    def swot_regenerate(self, request, pk=None):
        """Force la régénération automatique du SWOT"""
        role = get_user_role(request.user)
        if role not in ('admin', 'manager'):
            return Response({'detail': 'Permission refusée'}, status=403)
        project = self.get_object()
        swot, _ = SWOTMatrix.objects.get_or_create(project=project)
        swot.auto_generate()
        return Response(SWOTSerializer(swot).data)

    @action(detail=True, methods=['patch'])
    def swot_update(self, request, pk=None):
        """Mise à jour manuelle du SWOT"""
        role = get_user_role(request.user)
        if role not in ('admin', 'manager'):
            return Response({'detail': 'Permission refusée'}, status=403)
        project = self.get_object()
        swot, _ = SWOTMatrix.objects.get_or_create(project=project)
        for field in ['strengths','weaknesses','opportunities','threats','notes']:
            if field in request.data:
                setattr(swot, field, request.data[field])
        swot.auto_generated = False
        swot.save()
        return Response(SWOTSerializer(swot).data)


# ══════════════════════════════════════════
# WORK ITEMS — filtrés par rôle
# ══════════════════════════════════════════

class WorkItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = WorkItemSerializer

    def get_queryset(self):
        user   = self.request.user
        role   = get_user_role(user)
        member = get_user_member(user)

        qs = WorkItem.objects.select_related('assignee','project','sprint')

        # Admins/managers voient tout
        if role in ('admin', 'manager'):
            project_id = self.request.query_params.get('project')
            sprint_id  = self.request.query_params.get('sprint')
            status_f   = self.request.query_params.get('status')
            if project_id: qs = qs.filter(project_id=project_id)
            if sprint_id:  qs = qs.filter(sprint_id=sprint_id)
            if status_f:   qs = qs.filter(status=status_f)
            return qs

        # Membres voient uniquement leurs tickets
        if member:
            return qs.filter(
                Q(assignee=member) | Q(project__in=member.projects.all())
            )

        return WorkItem.objects.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def board(self, request):
        role     = get_user_role(request.user)
        member   = get_user_member(request.user)
        proj_id  = request.query_params.get('project')

        qs = self.get_queryset()
        if proj_id: qs = qs.filter(project_id=proj_id)

        cols = ['Backlog','A faire','En cours','Review','Terminé']
        return Response({col: WorkItemSerializer(qs.filter(status=col), many=True).data for col in cols})


# ══════════════════════════════════════════
# MEMBRES, TENDERS, SPRINTS
# ══════════════════════════════════════════

class MemberViewSet(viewsets.ModelViewSet):
    queryset           = Member.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class   = MemberSerializer

    def create(self, request, *args, **kwargs):
        if get_user_role(request.user) not in ('admin', 'manager'):
            return Response({'detail': 'Permission refusée'}, status=403)
        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def workload(self, request, pk=None):
        member = self.get_object()
        active = WorkItem.objects.filter(assignee=member, status='En cours').count()
        total  = WorkItem.objects.filter(assignee=member).count()
        return Response({'member_id': pk, 'active': active, 'total': total})


class TenderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = TenderSerializer

    def get_queryset(self):
        role = get_user_role(self.request.user)
        # Seuls les admins et managers voient les AO
        if role in ('admin', 'manager'):
            return Tender.objects.select_related('lead').all()
        return Tender.objects.none()

    @action(detail=False, methods=['get'])
    def pipeline(self, request):
        data = {}
        for s in ['Détection','Qualification','Préparation','Soumis','Gagné','Perdu']:
            data[s] = TenderSerializer(Tender.objects.filter(status=s), many=True).data
        return Response(data)


class SprintViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = SprintSerializer

    def get_queryset(self):
        role = get_user_role(self.request.user)
        # Seuls admins/managers accèdent aux sprints
        if role in ('admin', 'manager'):
            return Sprint.objects.prefetch_related('items').all()
        return Sprint.objects.none()