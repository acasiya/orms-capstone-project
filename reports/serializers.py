from rest_framework import serializers

from .models import FAQ, Concern, ConcernAttachment, ConcernFolder, Question, Report, ReportAttachment

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
            "nature_of_violation", "status", "remarks", "created_at", "updated_at",
            "files", "attachments",
        ]
        read_only_fields = ["id", "status", "remarks", "created_at", "updated_at"]

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
            "id", "location", "description", "status", "remarks", "created_at",
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
        concern = Concern.objects.create(**validated_data)
        for f in files:
            ConcernAttachment.objects.create(concern=concern, file=f)
        return concern


class StaffReportSerializer(serializers.ModelSerializer):
    """
    Read side for Staff/Admin (View Reports / Reports Dashboard) — adds who
    filed it, since the citizen-facing ReportSerializer has no reason to
    expose that about its own owner.
    """

    reporter = serializers.SerializerMethodField()
    contact_number = serializers.CharField(source="citizen.contact_number", read_only=True)
    attachments = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            "id", "reporter", "contact_number", "location", "ordinance",
            "incident_date", "incident_time", "nature_of_violation",
            "status", "remarks", "created_at", "updated_at", "attachments",
        ]

    def get_reporter(self, obj):
        return obj.citizen.get_full_name() or obj.citizen.username

    def get_attachments(self, obj):
        request = self.context.get("request")
        urls = [a.file.url for a in obj.attachments.all()]
        return [request.build_absolute_uri(u) for u in urls] if request else urls


class StaffReportUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only — status/remarks are the only things Staff/Admin get to change on someone else's report."""

    class Meta:
        model = Report
        fields = ["status", "remarks"]


class ConcernFolderSerializer(serializers.ModelSerializer):
    """Folder CRUD for the Concerns/Suggestions sidebar — `count` is how many concerns currently sit in it."""

    count = serializers.SerializerMethodField()

    class Meta:
        model = ConcernFolder
        fields = ["id", "name", "count", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_count(self, obj):
        return obj.concerns.count()

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Folder name can't be empty.")
        qs = ConcernFolder.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A folder with this name already exists.")
        return value


class ConcernFolderMiniSerializer(serializers.ModelSerializer):
    """Nested representation used on a concern — just enough to show/label the assigned folder."""

    class Meta:
        model = ConcernFolder
        fields = ["id", "name"]


class StaffConcernSerializer(serializers.ModelSerializer):
    """Read side for Staff/Admin (View Concerns/Suggestions Dashboard) — same idea as StaffReportSerializer."""

    reporter = serializers.SerializerMethodField()
    contact_number = serializers.CharField(source="citizen.contact_number", read_only=True)
    attachments = serializers.SerializerMethodField()
    folder = ConcernFolderMiniSerializer(read_only=True)

    class Meta:
        model = Concern
        fields = [
            "id", "reporter", "contact_number", "location", "description",
            "status", "remarks", "folder", "created_at", "updated_at", "attachments",
        ]

    def get_reporter(self, obj):
        return obj.citizen.get_full_name() or obj.citizen.username

    def get_attachments(self, obj):
        request = self.context.get("request")
        urls = [a.file.url for a in obj.attachments.all()]
        return [request.build_absolute_uri(u) for u in urls] if request else urls


class StaffConcernUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only — status/remarks/folder are the only things Staff/Admin get to change on someone else's concern."""

    folder = serializers.PrimaryKeyRelatedField(
        queryset=ConcernFolder.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Concern
        fields = ["status", "remarks", "folder"]


class QuestionSerializer(serializers.ModelSerializer):
    """Backs the citizen FAQs page: POST a new question, GET the citizen's own (with any answer)."""

    is_answered = serializers.BooleanField(read_only=True)

    class Meta:
        model = Question
        fields = ["id", "question", "answer", "is_answered", "created_at", "answered_at"]
        read_only_fields = ["id", "answer", "created_at", "answered_at"]

    def create(self, validated_data):
        validated_data["citizen"] = self.context["request"].user
        return Question.objects.create(**validated_data)


class StaffQuestionSerializer(serializers.ModelSerializer):
    """Read side for Staff/Admin's Questions page — adds who asked it, same idea as StaffReportSerializer."""

    asker = serializers.SerializerMethodField()
    asker_email = serializers.CharField(source="citizen.email", read_only=True)
    is_answered = serializers.BooleanField(read_only=True)

    class Meta:
        model = Question
        fields = [
            "id", "asker", "asker_email", "question", "answer",
            "is_answered", "created_at", "answered_at",
        ]

    def get_asker(self, obj):
        return obj.citizen.get_full_name() or obj.citizen.username


class StaffQuestionAnswerSerializer(serializers.ModelSerializer):
    """PATCH-only — answering a question is the only thing Staff/Admin do to one."""

    class Meta:
        model = Question
        fields = ["answer"]

    def validate_answer(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Answer can't be empty.")
        return value


class FAQSerializer(serializers.ModelSerializer):
    """Public FAQ list (citizen FAQs page, read-only there) — full CRUD for Admin."""

    class Meta:
        model = FAQ
        fields = ["id", "question", "answer", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_question(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Question can't be empty.")
        return value

    def validate_answer(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Answer can't be empty.")
        return value
