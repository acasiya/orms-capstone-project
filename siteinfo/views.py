from django.db import transaction
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import log_action
from accounts.views import IsAdmin

from .models import AboutLogo, BarangayProfile, CouncilMember
from .serializers import (
    AboutLogoSerializer,
    BarangayProfileSerializer,
    CouncilMemberSerializer,
    ReorderSerializer,
)

PROFILE_FIELD_LABELS = {
    "name": "name",
    "city": "city",
    "address": "address",
    "phone": "phone",
    "email": "email",
    "office_hours": "office hours",
    "emergency_hotline": "emergency hotline",
    "about_text": "What is SafeSpace",
    "mission_text": "Our Mission",
}


class AboutPublicView(APIView):
    """
    GET /api/site/about/ — everything the citizen About Us page and site
    footer show: the barangay's details, the visible council members and the
    visible logos. Public (guests browse About Us too).
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            "profile": BarangayProfileSerializer(BarangayProfile.load()).data,
            "council": CouncilMemberSerializer(CouncilMember.objects.filter(is_visible=True), many=True).data,
            "logos": AboutLogoSerializer(AboutLogo.objects.filter(is_visible=True), many=True).data,
        })


class BarangayProfileView(APIView):
    """GET/PATCH /api/site/profile/ — Administrator edits the barangay's details."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(BarangayProfileSerializer(BarangayProfile.load()).data)

    def patch(self, request):
        profile = BarangayProfile.load()
        before = BarangayProfileSerializer(profile).data
        serializer = BarangayProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        changed = [label for field, label in PROFILE_FIELD_LABELS.items() if before[field] != serializer.data[field]]
        if changed:
            log_action(request.user, f"Updated About Us details: {', '.join(changed)}")
        return Response(serializer.data)


def _delete_file(field):
    """Best-effort removal of a replaced/deleted upload (never the seeded images)."""
    if field:
        try:
            field.delete(save=False)
        except Exception:
            pass


class CouncilMemberListCreateView(generics.ListCreateAPIView):
    """GET (hidden ones too) / POST /api/site/council/ — Administrator only."""

    queryset = CouncilMember.objects.all()
    serializer_class = CouncilMemberSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        group = serializer.validated_data.get("group", CouncilMember.Group.MEMBER)
        last = CouncilMember.objects.filter(group=group).order_by("-order").first()
        member = serializer.save(order=(last.order + 1) if last else 0)
        log_action(self.request.user, f"Added {member.name} ({member.position}) to About Us")


class CouncilMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/site/council/<id>/ — Administrator only."""

    queryset = CouncilMember.objects.all()
    serializer_class = CouncilMemberSerializer
    permission_classes = [IsAdmin]

    def perform_update(self, serializer):
        old_photo = serializer.instance.photo if "photo" in serializer.validated_data else None
        old_file = old_photo.name if old_photo else None
        member = serializer.save()
        if old_file and old_file != member.photo.name:
            member.photo.storage.delete(old_file)
        log_action(self.request.user, f"Updated {member.name} ({member.position}) on About Us")

    def perform_destroy(self, instance):
        log_action(self.request.user, f"Removed {instance.name} ({instance.position}) from About Us")
        _delete_file(instance.photo)
        instance.delete()


class AboutLogoListCreateView(generics.ListCreateAPIView):
    """GET (hidden ones too) / POST /api/site/logos/ — Administrator only."""

    queryset = AboutLogo.objects.all()
    serializer_class = AboutLogoSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        last = AboutLogo.objects.order_by("-order").first()
        logo = serializer.save(order=(last.order + 1) if last else 0)
        log_action(self.request.user, f"Added logo \"{logo.alt_text}\" to About Us")


class AboutLogoDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/site/logos/<id>/ — Administrator only."""

    queryset = AboutLogo.objects.all()
    serializer_class = AboutLogoSerializer
    permission_classes = [IsAdmin]

    def perform_update(self, serializer):
        old_image = serializer.instance.image if "image" in serializer.validated_data else None
        old_file = old_image.name if old_image else None
        logo = serializer.save()
        if old_file and old_file != logo.image.name:
            logo.image.storage.delete(old_file)
        log_action(self.request.user, f"Updated logo \"{logo.alt_text}\" on About Us")

    def perform_destroy(self, instance):
        log_action(self.request.user, f"Removed logo \"{instance.alt_text}\" from About Us")
        _delete_file(instance.image)
        instance.delete()


class _ReorderView(APIView):
    """POST {"ids": [...]} — sets `order` to each id's position in the list."""

    permission_classes = [IsAdmin]
    model = None
    label = ""

    def post(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["ids"]
        found = set(self.model.objects.filter(id__in=ids).values_list("id", flat=True))
        if len(found) != len(set(ids)):
            return Response({"detail": "Some items no longer exist. Refresh and try again."}, status=400)
        with transaction.atomic():
            for index, item_id in enumerate(ids):
                self.model.objects.filter(id=item_id).update(order=index)
        log_action(request.user, f"Reordered {self.label} on About Us")
        return Response({"detail": "Order saved."})


class CouncilMemberReorderView(_ReorderView):
    model = CouncilMember
    label = "council members"


class AboutLogoReorderView(_ReorderView):
    model = AboutLogo
    label = "logos"
