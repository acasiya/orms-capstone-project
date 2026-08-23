from rest_framework import serializers

from .models import Concern, ConcernAttachment, Report, ReportAttachment

MAX_ATTACHMENTS = 5
MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024


def validate_attachment_files(files):
    if len(files) > MAX_ATTACHMENTS:
        raise serializers.ValidationError(f"You can attach at most {MAX_ATTACHMENTS} files.")
    if sum(f.size for f in files) > MAX_TOTAL_ATTACHMENT_BYTES:
        raise serializers.ValidationError("Attachments can't total more than 50MB.")
    return files


class ReportSerializer(serializers.ModelSerializer):
    """
    Backs both filing a report (POST, from file-report.html) and viewing it
    (GET, from My Reports/My Report Detail) — write-only `files` accepts the
    upload dropzone's selection, `attachments` is what's read back.
    """

    files = serializers.ListField(
        child=serializers.FileField(), write_only=True, required=False, allow_empty=True
    )
    attachments = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Report
        fields = [
            "id", "location", "ordinance", "incident_date", "incident_time",
            "nature_of_violation", "status", "remarks", "created_at",
            "files", "attachments",
        ]
        read_only_fields = ["id", "status", "remarks", "created_at"]

    def validate_files(self, files):
        return validate_attachment_files(files)

    def get_attachments(self, obj):
        request = self.context.get("request")
        urls = [a.file.url for a in obj.attachments.all()]
        return [request.build_absolute_uri(u) for u in urls] if request else urls

    def create(self, validated_data):
        files = validated_data.pop("files", [])
        validated_data["citizen"] = self.context["request"].user
        report = Report.objects.create(**validated_data)
        for f in files:
            ReportAttachment.objects.create(report=report, file=f)
        return report


class ConcernSerializer(serializers.ModelSerializer):
    """Backs both submitting a concern/suggestion and viewing it — same shape as ReportSerializer."""

    files = serializers.ListField(
        child=serializers.FileField(), write_only=True, required=False, allow_empty=True
    )
    attachments = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Concern
        fields = [
            "id", "location", "description", "status", "created_at",
            "files", "attachments",
        ]
        read_only_fields = ["id", "status", "created_at"]

    def validate_files(self, files):
        return validate_attachment_files(files)

    def get_attachments(self, obj):
        request = self.context.get("request")
        urls = [a.file.url for a in obj.attachments.all()]
        return [request.build_absolute_uri(u) for u in urls] if request else urls

    def create(self, validated_data):
        files = validated_data.pop("files", [])
        validated_data["citizen"] = self.context["request"].user
        concern = Concern.objects.create(**validated_data)
        for f in files:
            ConcernAttachment.objects.create(concern=concern, file=f)
        return concern
