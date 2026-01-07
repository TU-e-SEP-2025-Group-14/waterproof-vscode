import Lake
open Lake DSL

require «WaterproofGenre» from git "https://github.com/TU-e-SEP-2025-Group-14/waterproof-genre.git"@"e0e4b0418b7eba7a3c3f00dece5acca214c48ca0"
require «verbose» from git "https://github.com/PatrickMassot/verbose-lean4.git"@"c978de7"

package "WaterproofDocument" where
  version := v!"0.1.0"

@[default_target]
lean_lib «WaterproofDocument» where
  -- add library configuration options here
