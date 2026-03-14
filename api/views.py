# api/views.py — KICEKO ProjectHub — Fix définitif membres

from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, BasePermission, AllowAny
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Member, Project, WorkItem, Tender, Sprint, UserProfile, SWOTMatrix
from .serializers import (
    MemberSerializer, ProjectSerializer, WorkItemSerializer,
    TenderSerializer, SprintSerializer, SWOTSerializer
)


class NoPagination(PageNumberPagination):
    page_size = None
    def get_paginated_response(self, data): return Response(data)
    def paginate_queryset(self, queryset, request, view=None): return None


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated: return False
        if request.user.is_superuser: return True
        try: return request.user.profile.role == 'admin'
        except: return False


def get_user_role(user):
    if user.is_superuser: return 'admin'
    try: return user.profile.role
    except: return 'member'


def get_user_member(user):
    try: return user.profile.member
    except: return None


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    from django.contrib.auth import authenticate
    u = request.data.get('username','').strip()
    p = request.data.get('password','')
    user = authenticate(username=u, password=p)
    if not user:
        return Response({'detail':'Identifiants incorrects'}, status=401)
    refresh = RefreshToken.for_user(user)
    role   = get_user_role(user)
    member = get_user_member(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id, 'username': user.username,
            'first_name': user.first_name, 'last_name': user.last_name,
            'email': user.email, 'role': role,
            'is_admin': role == 'admin',
            'is_manager': role in ('admin','manager'),
            'member_id': member.id if member else None,
            'member_initials': member.initials if member else user.username[:2].upper(),
            'member_color': member.color if member else '#0eb5cc',
        }
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    user = request.user
    role = get_user_role(user)
    member = get_user_member(user)
    return Response({
        'id': user.id, 'username': user.username,
        'first_name': user.first_name, 'last_name': user.last_name,
        'email': user.email, 'role': role,
        'is_admin': role == 'admin',
        'is_manager': role in ('admin','manager'),
        'member_id': member.id if member else None,
        'member_initials': member.initials if member else user.username[:2].upper(),
        'member_color': member.color if member else '#0eb5cc',
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    username = request.data.get('username','').strip()
    password = request.data.get('password','')
    role     = request.data.get('role','member')
    if User.objects.filter(username=username).exists():
        return Response({'detail':"Nom d'utilisateur déjà pris"}, status=400)
    user = User.objects.create_user(
        username=username, password=password,
        first_name=request.data.get('first_name',''),
        last_name=request.data.get('last_name',''),
        email=request.data.get('email','')
    )
    p, _ = UserProfile.objects.get_or_create(user=user)
    p.role = role; p.save()
    refresh = RefreshToken.for_user(user)
    return Response({'access': str(refresh.access_token), 'refresh': str(refresh),
                     'user': {'id':user.id,'username':user.username,'role':role}}, status=201)


# ══ MEMBRES — FIX DÉFINITIF ══════════════════════════════
class MemberViewSet(viewsets.ModelViewSet):
    serializer_class   = MemberSerializer
    permission_classes = [IsAuthenticated]
    pagination_class   = NoPagination  # JAMAIS de {count, results}

    def get_queryset(self):
        # Toujours évalué à chaque requête — jamais de cache
        return Member.objects.all().order_by('name')

    def create(self, request, *args, **kwargs):
        if get_user_role(request.user) not in ('admin','manager'):
            return Response({'detail':'Permission refusée'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if get_user_role(request.user) not in ('admin','manager'):
            return Response({'detail':'Permission refusée'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if get_user_role(request.user) != 'admin':
            return Response({'detail':'Permission refusée'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def all(self, request):
        """Endpoint de secours /api/members/all/ — liste directe garantie"""
        return Response(MemberSerializer(Member.objects.all().order_by('name'), many=True).data)


# ══ DASHBOARD ════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    role = get_user_role(request.user)
    if role in ('admin','manager'):
        wi  = WorkItem.objects.all()
        tn  = Tender.objects.all()
        sp  = Sprint.objects.filter(status='En cours').first()
        wbs = {s: wi.filter(status=s).count() for s in ['Backlog','A faire','En cours','Review','Terminé']}
        aos = {s: tn.filter(status=s).count() for s in ['Détection','Qualification','Préparation','Soumis','Gagné','Perdu']}
        return Response({
            'role': role,
            'active_items': wi.filter(status='En cours').count(),
            'active_projects': Project.objects.filter(status='En cours').count(),
            'done_items': wi.filter(status='Terminé').count(),
            'total_tenders': tn.exclude(status__in=['Gagné','Perdu']).count(),
            'backlog_items': wi.filter(status='Backlog').count(),
            'total_members': Member.objects.count(),
            'items_by_status': wbs,
            'ao_by_status': aos,
            'active_sprint': {'id':sp.id,'name':sp.name,'pts_total':sp.pts_total,'pts_done':sp.pts_done,'start':sp.start,'end':sp.end} if sp else None,
            'recent_projects': list(Project.objects.order_by('-updated_at')[:5].values('id','name','status','progress','deadline','category')),
        })
    member = get_user_member(request.user)
    if member:
        my_wi = WorkItem.objects.filter(assignee=member)
        return Response({
            'role': role,
            'my_projects': list(member.projects.values('id','name','status','progress','deadline')),
            'my_tasks': list(my_wi.filter(status__in=['En cours','A faire']).values('id','title','status','priority','due')),
            'done_tasks': my_wi.filter(status='Terminé').count(),
            'active_tasks': my_wi.filter(status='En cours').count(),
        })
    return Response({'role': role, 'my_projects': [], 'my_tasks': [], 'done_tasks': 0, 'active_tasks': 0})


# ══ USERS ════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminRole])
def users_list_view(request):
    data = []
    for u in User.objects.select_related('profile','profile__member').all():
        role = get_user_role(u)
        member = get_user_member(u)
        data.append({
            'id':u.id,'username':u.username,'first_name':u.first_name,
            'last_name':u.last_name,'email':u.email,'role':role,
            'is_active':u.is_active,
            'member_id': member.id if member else None,
            'member_name': member.name if member else None,
        })
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsAdminRole])
def update_user_role(request, user_id):
    try:
        user = User.objects.get(id=user_id)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        role = request.data.get('role')
        member_id = request.data.get('member_id')
        if role and role in ['admin','manager','member']:
            profile.role = role
            user.is_staff = (role == 'admin')
            user.save()
        if member_id:
            try: profile.member = Member.objects.get(id=member_id)
            except: pass
        profile.save()
        return Response({'detail':'Mis à jour','role':profile.role})
    except User.DoesNotExist:
        return Response({'detail':'Introuvable'}, status=404)


# ══ PROJETS ══════════════════════════════════════════════
class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class   = ProjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        member = get_user_member(user)
        if role in ('admin','manager'):
            return Project.objects.prefetch_related('members').all().order_by('-updated_at')
        if member:
            return Project.objects.filter(members=member).prefetch_related('members').order_by('-updated_at')
        return Project.objects.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        if get_user_role(request.user) not in ('admin','manager'):
            return Response({'detail':'Permission refusée'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if get_user_role(request.user) != 'admin':
            return Response({'detail':'Permission refusée'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def swot(self, request, pk=None):
        project = self.get_object()
        swot, created = SWOTMatrix.objects.get_or_create(project=project)
        if created or not swot.strengths:
            swot.auto_generate()
        return Response(SWOTSerializer(swot).data)

    @action(detail=True, methods=['post'])
    def swot_regenerate(self, request, pk=None):
        if get_user_role(request.user) not in ('admin','manager'):
            return Response({'detail':'Permission refusée'}, status=403)
        swot, _ = SWOTMatrix.objects.get_or_create(project=self.get_object())
        swot.auto_generate()
        return Response(SWOTSerializer(swot).data)

    @action(detail=True, methods=['patch'])
    def swot_update(self, request, pk=None):
        if get_user_role(request.user) not in ('admin','manager'):
            return Response({'detail':'Permission refusée'}, status=403)
        swot, _ = SWOTMatrix.objects.get_or_create(project=self.get_object())
        for f in ['strengths','weaknesses','opportunities','threats','notes']:
            if f in request.data: setattr(swot, f, request.data[f])
        swot.auto_generated = False
        swot.save()
        return Response(SWOTSerializer(swot).data)


# ══ WORKITEMS ═════════════════════════════════════════════
class WorkItemViewSet(viewsets.ModelViewSet):
    serializer_class   = WorkItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        member = get_user_member(user)
        qs = WorkItem.objects.select_related('assignee','project','sprint').order_by('-updated_at')
        if role in ('admin','manager'):
            if p := self.request.query_params.get('project'): qs = qs.filter(project_id=p)
            if s := self.request.query_params.get('sprint'):  qs = qs.filter(sprint_id=s)
            if st:= self.request.query_params.get('status'):  qs = qs.filter(status=st)
            return qs
        if member:
            return qs.filter(Q(assignee=member)|Q(project__in=member.projects.all()))
        return WorkItem.objects.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ══ TENDERS ══════════════════════════════════════════════
class TenderViewSet(viewsets.ModelViewSet):
    serializer_class   = TenderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if get_user_role(self.request.user) in ('admin','manager'):
            return Tender.objects.select_related('lead').all().order_by('-created_at')
        return Tender.objects.none()

    @action(detail=False, methods=['get'])
    def pipeline(self, request):
        return Response({s: TenderSerializer(Tender.objects.filter(status=s), many=True).data
                         for s in ['Détection','Qualification','Préparation','Soumis','Gagné','Perdu']})


# ══ SPRINTS ═══════════════════════════════════════════════
class SprintViewSet(viewsets.ModelViewSet):
    serializer_class   = SprintSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if get_user_role(self.request.user) in ('admin','manager'):
            return Sprint.objects.prefetch_related('items').all().order_by('-start')
        return Sprint.objects.none()


# ══════════════════════════════════════════
# ENDPOINT DÉFINITIF MEMBRES — ajouté en bas
# ══════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def team_list(request):
    """
    GET /api/team/
    Retourne TOUJOURS une liste JSON directe []
    Sans pagination, sans enveloppe {count, results}
    """
    members = Member.objects.all().order_by('name')
    data = [
        {
            'id':       m.id,
            'name':     m.name,
            'role':     m.role or '',
            'initials': m.initials or (m.name[:2].upper() if m.name else 'XX'),
            'color':    m.color or '#0eb5cc',
            'email':    m.email or '',
        }
        for m in members
    ]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def team_create(request):
    if get_user_role(request.user) not in ('admin', 'manager'):
        return Response({'detail': 'Permission refusée'}, status=403)
    name     = request.data.get('name', '').strip()
    role     = request.data.get('role', '')
    initials = request.data.get('initials', name[:2].upper() if name else 'XX')
    color    = request.data.get('color', '#0eb5cc')
    email    = request.data.get('email', '')
    if not name:
        return Response({'detail': 'Le nom est obligatoire'}, status=400)
    m = Member.objects.create(
        name=name, role=role,
        initials=initials.upper()[:3],
        color=color, email=email,
    )
    return Response({'id':m.id,'name':m.name,'role':m.role,'initials':m.initials,'color':m.color,'email':m.email}, status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def team_delete(request, member_id):
    if get_user_role(request.user) != 'admin':
        return Response({'detail': 'Permission refusée'}, status=403)
    try:
        Member.objects.get(id=member_id).delete()
        return Response(status=204)
    except Member.DoesNotExist:
        return Response({'detail': 'Introuvable'}, status=404)