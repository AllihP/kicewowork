# api/urls.py — KICEKO ProjectHub

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register(r'projects',  views.ProjectViewSet,  basename='project')
router.register(r'workitems', views.WorkItemViewSet,  basename='workitem')
router.register(r'members',   views.MemberViewSet,    basename='member')
router.register(r'tenders',   views.TenderViewSet,    basename='tender')
router.register(r'sprints',   views.SprintViewSet,    basename='sprint')

urlpatterns = [
    # Auth
    path('auth/login/',    views.login_view,    name='login'),
    path('auth/refresh/',  TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/register/', views.register_view, name='register'),
    path('auth/me/',       views.me_view,       name='me'),

    # Dashboard
    path('dashboard/',     views.dashboard_view, name='dashboard'),

    # Gestion utilisateurs (admin)
    path('users/',                     views.users_list_view,  name='users-list'),
    path('users/<int:user_id>/role/',  views.update_user_role, name='user-role'),

    # Router CRUD
    path('', include(router.urls)),
]

# Endpoints SWOT (via le router ProjectViewSet) :
# GET  /api/projects/{id}/swot/            → voir le SWOT
# POST /api/projects/{id}/swot_regenerate/ → régénérer automatiquement
# PATCH /api/projects/{id}/swot_update/   → modifier manuellement