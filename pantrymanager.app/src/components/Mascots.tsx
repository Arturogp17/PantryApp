import { CSSProperties } from "react";
import { Box } from "@mui/material";
import { useAppTheme } from "../theme/ThemeContext";

interface MascotProps {
  size?: number;
  style?: CSSProperties;
}

// Las imágenes viven en public/mascots (WebP con fondo transparente).
const asset = (name: string) => `${import.meta.env.BASE_URL}mascots/${name}`;

export const FishMascot = ({ size = 180, style }: MascotProps) => (
  <img
    src={asset("fish.webp")}
    alt=""
    aria-hidden="true"
    width={size}
    draggable={false}
    style={{ height: "auto", ...style }}
  />
);

export const ToastMascot = ({ size = 180, style }: MascotProps) => (
  <img
    src={asset("toast.webp")}
    alt=""
    aria-hidden="true"
    width={size}
    draggable={false}
    style={{ height: "auto", ...style }}
  />
);

// Capa de fondo fija con las dos mascotas, tenue para no competir con el contenido.
export const MascotBackground = () => {
  const { tokens } = useAppTheme();

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        opacity: tokens.mascotOpacity,
      }}
    >
      <FishMascot
        size={210}
        style={{ position: "absolute", left: -48, top: 150, transform: "rotate(-12deg)" }}
      />
      <ToastMascot
        size={200}
        style={{ position: "absolute", right: -40, bottom: 130, transform: "rotate(9deg)" }}
      />
    </Box>
  );
};
