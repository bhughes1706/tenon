-- §3.5 chunk 17.1 — compound molding bits. A picture-frame / classical / cove-and-bead
-- bit is a fixed physical shape that no single primitive (roundover/chamfer/cove/ogee/
-- rabbet) can express, so its cross-section is carried as DATA: an arris-frame segment
-- path ({start, segments:[{kind:'line'|'arc', ...}]}, see EdgeProfileSchema 'compound').
-- Picking such a bit denormalizes that path onto the board's edge_profile, same as a
-- roundover's radius. `profile_geom` is NULL for the primitive bits seeded in 002.
ALTER TABLE bits ADD COLUMN profile_geom TEXT;   -- JSON: { start:[u,v], segments:[…] } | NULL

INSERT INTO bits (id, name, profile, radius, angle_deg, cut_width, cut_depth, shank, brand, notes, profile_geom) VALUES
  ('bit_classical_12', 'Classical 1/2" molding', 'compound', NULL, NULL, NULL, NULL, '1/2', NULL, NULL,
   '{"start":[0.5,0],"segments":[{"kind":"arc","to":[0.25,0.25],"center":[0.25,0],"dir":"ccw"},{"kind":"arc","to":[0,0.5],"center":[0.25,0.5],"dir":"cw"}]}'),
  ('bit_pictureframe_58', 'Picture Frame 5/8"', 'compound', NULL, NULL, NULL, NULL, '1/2', NULL, NULL,
   '{"start":[0.625,0],"segments":[{"kind":"arc","to":[0.375,0.25],"center":[0.375,0],"dir":"ccw"},{"kind":"arc","to":[0.125,0.25],"center":[0.25,0.25],"dir":"ccw"},{"kind":"line","to":[0,0.375]}]}');
