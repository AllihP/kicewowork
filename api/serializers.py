# api/serializers.py — KICEKO ProjectHub

from django.contrib.auth.models import User
from rest_framework import serializers
from core.models import Member, Project, WorkItem, Tender, Sprint, UserProfile, SWOTMatrix


class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Member
        fields = ['id','name','role','initials','color','email','created_at']


class UserProfileSerializer(serializers.ModelSerializer):
    username   = serializers.CharField(source='user.username', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name  = serializers.CharField(source='user.last_name', read_only=True)
    email      = serializers.CharField(source='user.email', read_only=True)
    member     = MemberSerializer(read_only=True)
    member_id  = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), source='member', write_only=True, allow_null=True, required=False
    )

    class Meta:
        model  = UserProfile
        fields = ['id','username','first_name','last_name','email','role','member','member_id']


class SWOTSerializer(serializers.ModelSerializer):
    project_name   = serializers.CharField(source='project.name', read_only=True)
    project_status = serializers.CharField(source='project.status', read_only=True)
    project_progress = serializers.IntegerField(source='project.progress', read_only=True)

    class Meta:
        model  = SWOTMatrix
        fields = [
            'id','project','project_name','project_status','project_progress',
            'strengths','weaknesses','opportunities','threats',
            'auto_generated','last_sync','notes'
        ]


class WorkItemSerializer(serializers.ModelSerializer):
    assignee_detail = MemberSerializer(source='assignee', read_only=True)
    project_name    = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model  = WorkItem
        fields = [
            'id','title','description','type','status','priority','pts',
            'project','project_name','assignee','assignee_detail',
            'sprint','due','created_at','updated_at'
        ]


class ProjectSerializer(serializers.ModelSerializer):
    members_detail    = MemberSerializer(source='members', many=True, read_only=True)
    work_items_count  = serializers.IntegerField(source='work_items.count', read_only=True)
    swot              = SWOTSerializer(read_only=True)
    members           = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), many=True, required=False
    )

    class Meta:
        model  = Project
        fields = [
            'id','name','description','category','status','progress','deadline',
            'members','members_detail','work_items_count',
            'created_by','created_at','updated_at','swot'
        ]


class TenderSerializer(serializers.ModelSerializer):
    lead_detail = MemberSerializer(source='lead', read_only=True)

    class Meta:
        model  = Tender
        fields = ['id','title','org','amount','deadline','status','lead','lead_detail','notes','created_at']


class SprintSerializer(serializers.ModelSerializer):
    items_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model  = Sprint
        fields = ['id','name','project','status','start','end','pts_total','pts_done','goal','items_count','created_at']