import { ImageResponse } from "next/og"

export const size = {
  width: 32,
  height: 32,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#5b4770",
          border: "3px solid #332b59",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: "inset 2px 2px 0 #8a6b89, inset -2px -2px 0 #403553",
          }}
        />

        <div
          style={{
            width: 12,
            height: 16,
            background:
              "linear-gradient(180deg, #fff1b8 0%, #fff1b8 30%, #f7cd77 30%, #f7cd77 62%, #eba54d 62%, #eba54d 100%)",
            border: "2px solid #332b59",
            boxSizing: "border-box",
            boxShadow: "3px 3px 0 rgba(37, 29, 57, 0.35)",
            transform: "translate(-1px, -1px)",
          }}
        />
      </div>
    ),
    size
  )
}