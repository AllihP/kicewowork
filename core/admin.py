from django.contrib import admin
from .models import Member, Project, WorkItem, Tender, Sprint


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display  = ['name', 'role', 'initials', 'color']
    search_fields = ['name', 'role']


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display   = ['name', 'status', 'category', 'progress', 'deadline']
    list_filter    = ['status', 'category']
    search_fields  = ['name', 'description']
    filter_horizontal = ['members']


@admin.register(WorkItem)
class WorkItemAdmin(admin.ModelAdmin):
    list_display  = ['title', 'type', 'status', 'priority', 'pts', 'assignee', 'project', 'due']
    list_filter   = ['type', 'status', 'priority']
    search_fields = ['title', 'description']
    raw_id_fields = ['assignee', 'project', 'sprint']


@admin.register(Tender)
class TenderAdmin(admin.ModelAdmin):
    list_display  = ['title', 'org', 'amount', 'status', 'deadline', 'lead']
    list_filter   = ['status']
    search_fields = ['title', 'org']


@admin.register(Sprint)
class SprintAdmin(admin.ModelAdmin):
    list_display  = ['name', 'project', 'status', 'start', 'end', 'pts_done', 'pts_total']
    list_filter   = ['status', 'project']
