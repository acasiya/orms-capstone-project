from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, log_action
from accounts.views import IsSecretaryOrAdmin

from .models import Ordinance
from .serializers import OrdinanceCreateSerializer, OrdinanceSerializer, OrdinanceUpdateSerializer


def _is_staff_or_admin(user):
    return bool(user and user.is_authenticated and user.role in (User.Role.STAFF, User.Role.ADMIN))


class OrdinanceListCreateView(generics.ListCreateAPIView):
    """
    GET /api/ordinances/ — citizens/guests only see non-archived ordinances
    (browsable without an account, same as the old hardcoded placeholder
    list); Staff/Admin see every ordinance, archived included, so Secretary
    can find one again to unarchive it.
    POST /api/ordinances/ — upload a new ordinance. Secretary/Admin only —
    Ordinances is a full-edit section for Secretary; Barangay Captain only
    gets a read-only view of it (see accounts.views.IsSecretaryOrAdmin).
    """

    def get_queryset(self):
        if _is_staff_or_admin(self.request.user):
            return Ordinance.objects.all()
        return Ordinance.objects.filter(is_archived=False)

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSecretaryOrAdmin()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        return OrdinanceCreateSerializer if self.request.method == "POST" else OrdinanceSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ordinance = serializer.save(uploaded_by=request.user)
        log_action(request.user, f"Uploaded ordinance {ordinance.number} — {ordinance.title}")
        return Response(
            OrdinanceSerializer(ordinance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrdinanceDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/ordinances/<id>/ — one ordinance; 404s for citizens/guests if
    it's archived (same visibility rule as the list).
    PATCH /api/ordinances/<id>/ — edit it, optionally replacing the PDF. Secretary/Admin only.
    """

    def get_queryset(self):
        if _is_staff_or_admin(self.request.user):
            return Ordinance.objects.all()
        return Ordinance.objects.filter(is_archived=False)

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsSecretaryOrAdmin()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        return OrdinanceUpdateSerializer if self.request.method in ("PATCH", "PUT") else OrdinanceSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        ordinance = serializer.save()
        log_action(request.user, f"Updated ordinance {ordinance.number} — {ordinance.title}")
        return Response(OrdinanceSerializer(ordinance, context={"request": request}).data)


class OrdinanceArchiveView(APIView):
    """
    POST /api/ordinances/<id>/archive/ — Secretary/Admin hides an ordinance
    from the Citizen portal without deleting it (see get_queryset filters
    above). Staff/Admin can still see and unarchive it.
    """

    permission_classes = [IsSecretaryOrAdmin]

    def post(self, request, pk):
        ordinance = get_object_or_404(Ordinance, pk=pk)
        ordinance.is_archived = True
        ordinance.save(update_fields=["is_archived"])
        log_action(request.user, f"Archived ordinance {ordinance.number} — {ordinance.title}")
        return Response(OrdinanceSerializer(ordinance, context={"request": request}).data)


class OrdinanceUnarchiveView(APIView):
    """POST /api/ordinances/<id>/unarchive/ — Secretary/Admin restores an archived ordinance to the Citizen portal."""

    permission_classes = [IsSecretaryOrAdmin]

    def post(self, request, pk):
        ordinance = get_object_or_404(Ordinance, pk=pk)
        ordinance.is_archived = False
        ordinance.save(update_fields=["is_archived"])
        log_action(request.user, f"Unarchived ordinance {ordinance.number} — {ordinance.title}")
        return Response(OrdinanceSerializer(ordinance, context={"request": request}).data)
