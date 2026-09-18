from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, log_action
from accounts.views import IsSecretaryOrAdmin

from .matching import suggest_ordinances
from .models import Ordinance, OrdinanceDownload
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


class OrdinanceSuggestView(APIView):
    """
    GET /api/ordinances/suggest/?q=<text> — ranks non-archived ordinances by
    relevance to the citizen-typed violation text, for the File a Report
    form's suggestion panel. Public, and always excludes archived
    ordinances regardless of caller — this endpoint has exactly one
    consumer (the citizen form), unlike OrdinanceListCreateView which also
    serves Staff/Admin.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response({"results": []})

        ordinances = Ordinance.objects.filter(is_archived=False)
        matches = suggest_ordinances(query, ordinances)
        return Response({
            "results": [
                {"id": str(o.id), "number": o.number, "title": o.title, "score": round(score, 4)}
                for o, score in matches
            ]
        })


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


class OrdinanceDownloadView(APIView):
    """
    GET /api/ordinances/<id>/download/ — hands back the real PDF URL rather
    than a plain <a href> straight to storage, so the download can actually
    be gated and logged. A citizen gets exactly one download per ordinance
    (OrdinanceDownload's unique_together); Staff/Admin aren't limited — the
    cap is specifically to stop a citizen's link from being reshared/scraped
    indefinitely, not to restrict staff doing their job. Every successful
    download (citizen or staff) is written to the audit log either way.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ordinance = get_object_or_404(Ordinance, pk=pk)
        if not ordinance.pdf_file:
            return Response({"detail": "This ordinance has no PDF on file."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_citizen = user.role == User.Role.CITIZEN

        if is_citizen:
            _, created = OrdinanceDownload.objects.get_or_create(ordinance=ordinance, citizen=user)
            if not created:
                return Response(
                    {
                        "detail": (
                            "You've already downloaded this ordinance. "
                            "Each ordinance can only be downloaded once."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        log_action(user, f"Downloaded ordinance {ordinance.number} — {ordinance.title}")

        url = ordinance.pdf_file.url
        return Response({"pdf_url": request.build_absolute_uri(url)})
