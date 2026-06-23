from django.contrib import admin
from .models import Member, Project, WorkItem, Tender, Sprint, UserProfile, SWOTMatrix
 
@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display  = ['name', 'role', 'initials', 'color', 'email']
    search_fields = ['name', 'role', 'email']
    ordering      = ['name']
 
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Forcer la régénération SWOT des projets liés
        for project in obj.projects.all():
            try:
                swot, _ = SWOTMatrix.objects.get_or_create(project=project)
                swot.auto_generate()
            except Exception:
                pass
 
@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display   = ['name', 'category', 'status', 'progress', 'deadline']
    list_filter    = ['status', 'category']
    search_fields  = ['name', 'description']
    filter_horizontal = ['members']
 
@admin.register(WorkItem)
class WorkItemAdmin(admin.ModelAdmin):
    list_display  = ['title', 'type', 'status', 'priority', 'assignee', 'project']
    list_filter   = ['status', 'type', 'priority']
    search_fields = ['title', 'description']
 
@admin.register(Tender)
class TenderAdmin(admin.ModelAdmin):
    list_display  = ['title', 'org', 'status', 'amount', 'deadline']
    list_filter   = ['status']
    search_fields = ['title', 'org']
 
@admin.register(Sprint)
class SprintAdmin(admin.ModelAdmin):
    list_display = ['name', 'project', 'status', 'start', 'end', 'pts_done', 'pts_total']
 
@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display  = ['user', 'role', 'member']
    list_filter   = ['role']
    search_fields = ['user__username', 'user__first_name']
 
@admin.register(SWOTMatrix)
class SWOTAdmin(admin.ModelAdmin):
    list_display     = ['project', 'auto_generated', 'last_sync']
    readonly_fields  = ['last_sync']
    actions          = ['regenerate_swot']
 
    def regenerate_swot(self, request, queryset):
        for swot in queryset:
            swot.auto_generate()
        self.message_user(request, f'{queryset.count()} SWOT régénéré(s)')
    regenerate_swot.short_description = '🧠 Régénérer SWOT'