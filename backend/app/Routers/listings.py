from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.Routers.matches import compare_preferences

router = APIRouter(
    prefix="/listings",
    tags=["Roommate Listings"],
)


class ListingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    location: str = Field(min_length=1, max_length=200)
    rent: float = Field(gt=0)
    deposit: float | None = Field(default=None, ge=0)
    room_type: str = Field(min_length=1, max_length=50)
    spots: int = Field(default=1, ge=1, le=20)
    amenities: str | None = Field(default=None, max_length=2000)
    available_from: str = Field(min_length=1, max_length=20)
    college: str | None = Field(default=None, max_length=200)
    degree: str | None = Field(default=None, max_length=200)
    stream: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=1950, le=2100)
    lifestyle_preferences: str | None = Field(default=None, max_length=2000)


# Used internally to map a DB row to the API response (includes owner info)
SELECT_COLUMNS = """
    r.id,
    r.owner_id,
    u.name AS owner_name,
    r.title,
    r.description,
    r.location,
    r.rent,
    r.deposit,
    r.room_type,
    r.spots,
    r.amenities,
    r.available_from,
    r.college,
    r.degree,
    r.stream,
    r.year,
    r.lifestyle_preferences,
    r.status
"""


def _row_to_dict(row):
    return {
        "id": row[0],
        "owner_id": row[1],
        "owner_name": row[2],
        "title": row[3],
        "description": row[4],
        "location": row[5],
        "rent": float(row[6]),
        "deposit": float(row[7]) if row[7] is not None else None,
        "room_type": row[8],
        "spots": row[9],
        "amenities": row[10],
        "available_from": row[11],
        "college": row[12],
        "degree": row[13],
        "stream": row[14],
        "year": row[15],
        "lifestyle_preferences": row[16],
        "status": row[17],
    }


def _profile_dict(cursor, user_id: int):
    """Profile dict matching matches.compare_preferences keys, or None."""
    cursor.execute(
        """
        SELECT
            sleep_schedule,
            cleanliness,
            noise_tolerance,
            study_habits,
            smoking_preference,
            food_preferences,
            social_preferences,
            guest_preferences
        FROM student_profiles
        WHERE user_id = %s
        """,
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "sleep_schedule": row[0],
        "cleanliness": row[1],
        "noise_tolerance": row[2],
        "study_habits": row[3],
        "smoking_preference": row[4],
        "food_preferences": row[5],
        "social_preference": row[6],
        "guest_preferences": row[7],
    }


def _with_fit(cursor, listing, user_id: int):
    """Add compatibility fit between the viewer and the listing owner."""
    my_profile = _profile_dict(cursor, user_id)
    if my_profile is None:
        listing["compatibility"] = None
        listing["reasons"] = []
        return listing

    owner_profile = _profile_dict(cursor, listing["owner_id"])
    if owner_profile is None:
        listing["compatibility"] = None
        listing["reasons"] = []
        return listing

    score, reasons = compare_preferences(my_profile, owner_profile)
    listing["compatibility"] = score
    listing["reasons"] = reasons
    return listing


@router.post("/")
def create_listing(
    listing: ListingCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO room_listings
                (
                    owner_id,
                    title,
                    description,
                    location,
                    rent,
                    deposit,
                    room_type,
                    spots,
                    amenities,
                    available_from,
                    college,
                    degree,
                    stream,
                    year,
                    lifestyle_preferences,
                    status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    user_id,
                    listing.title,
                    listing.description,
                    listing.location,
                    listing.rent,
                    listing.deposit,
                    listing.room_type,
                    listing.spots,
                    listing.amenities,
                    listing.available_from,
                    listing.college,
                    listing.degree,
                    listing.stream,
                    listing.year,
                    listing.lifestyle_preferences,
                    "available",
                ),
            )

            listing_id = cursor.fetchone()[0]
            connection.commit()

            return {
                "message": "Roommate listing created",
                "listing_id": listing_id,
            }

    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to create listing",
        )
    finally:
        connection.close()


@router.put("/{listing_id}")
def update_listing(
    listing_id: int,
    listing: ListingCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE room_listings
                SET
                    title = %s,
                    description = %s,
                    location = %s,
                    rent = %s,
                    deposit = %s,
                    room_type = %s,
                    spots = %s,
                    amenities = %s,
                    available_from = %s,
                    college = %s,
                    degree = %s,
                    stream = %s,
                    year = %s,
                    lifestyle_preferences = %s
                WHERE id = %s
                AND owner_id = %s
                RETURNING id
                """,
                (
                    listing.title,
                    listing.description,
                    listing.location,
                    listing.rent,
                    listing.deposit,
                    listing.room_type,
                    listing.spots,
                    listing.amenities,
                    listing.available_from,
                    listing.college,
                    listing.degree,
                    listing.stream,
                    listing.year,
                    listing.lifestyle_preferences,
                    listing_id,
                    user_id,
                ),
            )

            updated = cursor.fetchone()

            if not updated:
                raise HTTPException(
                    status_code=404,
                    detail="Listing not found or you are not the owner",
                )

            connection.commit()

            return {
                "message": "Listing updated",
                "listing_id": listing_id,
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to update listing",
        )
    finally:
        connection.close()


@router.get("/")
def get_listings(
    location: str | None = None,
    min_rent: float | None = None,
    max_rent: float | None = None,
    room_type: str | None = None,
    college: str | None = None,
    degree: str | None = None,
    stream: str | None = None,
    available_from: str | None = None,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            query = f"""
                SELECT
                    {SELECT_COLUMNS}
                FROM room_listings r
                JOIN users u ON u.id = r.owner_id
                WHERE r.status = 'available'
            """

            params = []

            if location:
                query += " AND LOWER(r.location) LIKE LOWER(%s)"
                params.append(f"%{location}%")

            if min_rent is not None:
                query += " AND r.rent >= %s"
                params.append(min_rent)

            if max_rent is not None:
                query += " AND r.rent <= %s"
                params.append(max_rent)

            if room_type:
                query += " AND r.room_type = %s"
                params.append(room_type)

            if college:
                query += " AND LOWER(r.college) LIKE LOWER(%s)"
                params.append(f"%{college}%")

            if degree:
                query += " AND LOWER(r.degree) LIKE LOWER(%s)"
                params.append(f"%{degree}%")

            if stream:
                query += " AND LOWER(r.stream) LIKE LOWER(%s)"
                params.append(f"%{stream}%")

            if available_from:
                query += " AND r.available_from <= %s"
                params.append(available_from)

            query += " ORDER BY r.id DESC"

            cursor.execute(query, params)

            rows = cursor.fetchall()

            listings = [_with_fit(cursor, _row_to_dict(row), user_id) for row in rows]

            return {
                "listings": listings
            }

    finally:
        connection.close()


@router.get("/{listing_id}")
def get_listing(
    listing_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT
                    {SELECT_COLUMNS}
                FROM room_listings r
                JOIN users u ON u.id = r.owner_id
                WHERE r.id = %s
                """,
                (listing_id,),
            )

            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Listing not found",
                )

            return _with_fit(cursor, _row_to_dict(row), user_id)

    finally:
        connection.close()


@router.delete("/{listing_id}")
def delete_listing(
    listing_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM room_listings
                WHERE id = %s
                AND owner_id = %s
                RETURNING id
                """,
                (listing_id, user_id),
            )

            deleted = cursor.fetchone()

            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail="Listing not found or you are not the owner",
                )

            connection.commit()

            return {
                "message": "Listing deleted"
            }

    finally:
        connection.close()