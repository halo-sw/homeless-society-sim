"""US inferred heights stay low-rise; KR inference is unchanged."""

from pipeline.building_join import FLOOR_HEIGHT_M, infer_height


def test_us_yes_spread_1_to_2():
    floors_seen = set()
    ones = twos = 0
    for i in range(200):
        height, floors = infer_height("yes", 150.0, "us-menlo", f"w{i}",
                                      country="US")
        assert floors in (1, 2)
        assert height == round(floors * FLOOR_HEIGHT_M, 2)
        floors_seen.add(floors)
        if floors == 1:
            ones += 1
        else:
            twos += 1
    assert floors_seen == {1, 2}
    assert ones >= 60
    assert twos >= 60


def test_us_carport_accessory():
    assert infer_height("carport", 150.0, "us-menlo", "w1",
                        country="US") == (3.0, 1)


def test_us_apartments_large_footprint():
    height, floors = infer_height("apartments", 6000.0, "us-menlo", "w1",
                                  country="US")
    assert floors in (3, 4)
    assert height == round(floors * FLOOR_HEIGHT_M, 2)


def test_kr_default_and_explicit_match_pinned_value():
    default = infer_height("yes", 150.0, "st-강남", "b1")
    explicit = infer_height("yes", 150.0, "st-강남", "b1", country="KR")
    assert default == explicit == (9.0, 3)
